#!/usr/bin/env python3
"""Bulk-import a Google Takeout export into Nimbus.

Walks an extracted Takeout tree, uploads each file straight to S3 with
boto3, and writes matching item documents to MongoDB — mirroring the
directory structure as Nimbus folders.

This deliberately bypasses the presigned-URL API. That flow exists to keep
Lambda out of the byte path for interactive uploads; for a one-time bulk
job it would just add a round trip per file.

Google Photos sidecars matter: the extracted media file's mtime is the
*export* time, not when the photo was taken, so without reading them the
Photos date grid is wrong for every item. See requirements.md §7.

Usage:
    python scripts/migrate_takeout.py --email you@example.com --source ~/Takeout
    python scripts/migrate_takeout.py --email you@example.com --source ~/Takeout --dry-run
    python scripts/migrate_takeout.py --email you@example.com --source ~/Takeout --limit 20

Re-running is safe: files already imported are skipped by source path.
"""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator
from uuid import uuid4

# Run from the repo root; reuse the backend's config and storage rules.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import boto3  # noqa: E402
from botocore.config import Config  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.storage.keys import build_user_key  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("migrate")

# Takeout scatters these through the export; none are user content.
IGNORED_NAMES = {
    "archive_browser.html",
    "user-generated-memory-titles.json",
    "shared_album_comments.json",
    "print-subscriptions.json",
    ".DS_Store",
}
IGNORED_SUFFIXES = {".json"}  # sidecars are read, never imported as files

# Marks documents this script created so re-runs can skip them. Invisible
# to the API, which never reads the field.
SOURCE_FIELD = "migration_source"


# --- sidecar resolution -------------------------------------------------

def sidecar_candidates(media: Path) -> Iterator[Path]:
    """Plausible sidecar paths for a media file, best guess first.

    Takeout is inconsistent here across export vintages: the JSON may be
    `photo.jpg.json`, `photo.jpg.supplemental-metadata.json`, or
    `photo.json`; long names are truncated to a fixed length; and
    duplicates put the counter in a different place
    (`photo(1).jpg` -> `photo.jpg(1).json`).
    """
    parent, name, stem = media.parent, media.name, media.stem

    yield parent / f"{name}.json"
    yield parent / f"{name}.supplemental-metadata.json"
    yield parent / f"{stem}.json"

    # "photo(1).jpg" -> "photo.jpg(1).json"
    if "(" in stem and stem.endswith(")"):
        base, _, counter = stem.rpartition("(")
        if counter[:-1].isdigit():
            yield parent / f"{base}{media.suffix}({counter}.json"

    # Edited copies share the original's metadata.
    for marker in ("-edited", "-EFFECTS", "-SMILE"):
        if stem.endswith(marker):
            original = stem[: -len(marker)]
            yield parent / f"{original}{media.suffix}.json"

    # Takeout truncates long filenames; the sidecar is truncated too.
    if len(name) > 46:
        yield parent / f"{name[:46]}.json"
        yield parent / f"{name[:46]}.supplemental-metadata.json"


def find_sidecar(media: Path) -> Path | None:
    for candidate in sidecar_candidates(media):
        if candidate.is_file():
            return candidate
    return None


def taken_at_from_sidecar(sidecar: Path) -> datetime | None:
    """Read the true capture time. photoTakenTime beats creationTime,
    which is when the file was uploaded to Google, not when it was shot."""
    try:
        data = json.loads(sidecar.read_text(encoding="utf-8", errors="replace"))
    except (OSError, json.JSONDecodeError):
        log.warning("Unreadable sidecar: %s", sidecar)
        return None

    for field in ("photoTakenTime", "creationTime"):
        stamp = data.get(field, {}).get("timestamp")
        if stamp:
            try:
                return datetime.fromtimestamp(int(stamp), tz=timezone.utc)
            except (ValueError, OSError, OverflowError):
                continue
    return None


# --- migration ----------------------------------------------------------

class Migrator:
    def __init__(self, email: str, source: Path, dry_run: bool, limit: int | None, workers: int):
        self.source = source
        self.dry_run = dry_run
        self.limit = limit
        self.workers = workers

        self.mongo = MongoClient(settings.MONGODB_URL)
        self.db = self.mongo[settings.MONGODB_DB_NAME]

        user = self.db.users.find_one({"email": email})
        if not user:
            raise SystemExit(
                f"No account for {email}. Register through the app first, "
                "so files land under a real user."
            )
        self.user_id = str(user["_id"])
        log.info("Importing as %s (%s)", email, self.user_id)

        self.s3 = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            endpoint_url=settings.S3_ENDPOINT_URL
            or f"https://s3.{settings.S3_REGION}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )
        self.bucket = settings.S3_BUCKET_NAME

        # Directory path -> Nimbus folder id, so each folder is made once.
        self._folders: dict[Path, str | None] = {source: None}
        self._already: set[str] = {
            doc[SOURCE_FIELD]
            for doc in self.db.items.find(
                {"user_id": self.user_id, SOURCE_FIELD: {"$exists": True}},
                {SOURCE_FIELD: 1},
            )
        }
        if self._already:
            log.info("%d files already imported; they will be skipped", len(self._already))

        self.uploaded = self.skipped = self.failed = 0
        self.bytes_sent = 0

    # -- folders --

    def folder_id_for(self, directory: Path) -> str | None:
        """Nimbus folder id for a directory, creating ancestors as needed."""
        if directory in self._folders:
            return self._folders[directory]

        parent_id = self.folder_id_for(directory.parent)
        name = directory.name

        existing = self.db.items.find_one(
            {"user_id": self.user_id, "parent_id": parent_id, "name": name, "type": "folder"}
        )
        if existing:
            folder_id = str(existing["_id"])
        elif self.dry_run:
            folder_id = f"dry-run-{name}"
        else:
            now = datetime.now(timezone.utc)
            result = self.db.items.insert_one(
                {
                    "user_id": self.user_id,
                    "name": name,
                    "type": "folder",
                    "parent_id": parent_id,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            folder_id = str(result.inserted_id)

        self._folders[directory] = folder_id
        return folder_id

    # -- files --

    def candidates(self) -> Iterator[Path]:
        for root, dirs, filenames in os.walk(self.source):
            dirs.sort()
            for filename in sorted(filenames):
                path = Path(root) / filename
                if filename in IGNORED_NAMES or path.suffix.lower() in IGNORED_SUFFIXES:
                    continue
                yield path

    def migrate_one(self, path: Path) -> None:
        relative = str(path.relative_to(self.source))
        if relative in self._already:
            self.skipped += 1
            return

        try:
            size = path.stat().st_size
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"

            sidecar = find_sidecar(path)
            taken_at = taken_at_from_sidecar(sidecar) if sidecar else None
            if taken_at is None and content_type.startswith("image/"):
                # Better than nothing, but this is the export date — the
                # grid will be approximate for these.
                taken_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)

            parent_id = self.folder_id_for(path.parent)
            key = build_user_key(self.user_id, f"files/{uuid4().hex}")

            if self.dry_run:
                log.info(
                    "[dry-run] %s (%s, %s) taken_at=%s",
                    relative, content_type, _human(size),
                    taken_at.date() if taken_at else "unknown",
                )
            else:
                self.s3.upload_file(
                    str(path), self.bucket, key,
                    ExtraArgs={"ContentType": content_type},
                )
                now = datetime.now(timezone.utc)
                self.db.items.insert_one(
                    {
                        "user_id": self.user_id,
                        "name": path.name,
                        "type": "file",
                        "parent_id": parent_id,
                        "s3_key": key,
                        "size": size,
                        "content_type": content_type,
                        # Uploaded synchronously here, so it is ready
                        # immediately — there is no pending phase.
                        "status": "ready",
                        "taken_at": taken_at,
                        "created_at": now,
                        "updated_at": now,
                        SOURCE_FIELD: relative,
                    }
                )

            self.uploaded += 1
            self.bytes_sent += size
            if self.uploaded % 25 == 0:
                log.info("%d files, %s uploaded", self.uploaded, _human(self.bytes_sent))

        except Exception:
            self.failed += 1
            log.exception("Failed: %s", relative)

    def run(self) -> None:
        files = list(self.candidates())
        if self.limit:
            files = files[: self.limit]
        log.info("Found %d files to consider", len(files))

        # Folders are created lazily and shared, so building them up front
        # on one thread avoids two workers racing to create the same one.
        for path in files:
            self.folder_id_for(path.parent)

        with ThreadPoolExecutor(max_workers=self.workers) as pool:
            list(pool.map(self.migrate_one, files))

        log.info(
            "Done. uploaded=%d skipped=%d failed=%d total=%s",
            self.uploaded, self.skipped, self.failed, _human(self.bytes_sent),
        )
        if self.dry_run:
            log.info("Dry run — nothing was written to S3 or MongoDB.")
        self.mongo.close()


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True, help="Existing Nimbus account to import into.")
    parser.add_argument("--source", required=True, type=Path, help="Extracted Takeout directory.")
    parser.add_argument("--dry-run", action="store_true", help="Report only; write nothing.")
    parser.add_argument("--limit", type=int, help="Only process the first N files.")
    parser.add_argument(
        "--workers", type=int, default=4,
        help="Parallel uploads (default 4; raise on a fast connection).",
    )
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Not a directory: {source}")

    Migrator(args.email, source, args.dry_run, args.limit, args.workers).run()


if __name__ == "__main__":
    main()
