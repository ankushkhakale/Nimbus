"""File and folder business rules.

Storage keys are derived from a random UUID rather than the item's name
or path, so renaming or moving an item is a metadata-only update and
never requires copying objects in S3.

Deletion is soft: items move to a trash state and are purged later by a
scheduled job. Nothing in this service removes bytes from S3 except the
purge and an explicit permanent delete.
"""

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.file_version import FileVersion
from app.models.item import Item, ItemType, UploadStatus
from app.repositories.item_repository import MAX_PAGE_SIZE, ItemRepository
from app.repositories.version_repository import VersionRepository
from app.storage.base import ObjectStorage
from app.storage.keys import (
    InvalidObjectKey,
    build_user_key,
    is_owned_by,
    thumbnail_key,
)

logger = logging.getLogger(__name__)

# How long trashed items are recoverable before the purge removes them.
TRASH_RETENTION_DAYS = 30

# Duplicate/stack detection does an O(n^2) pairwise comparison over
# whatever this returns — cheap per pair (an XOR and a bit count), but
# still bounded rather than scanning an unlimited library on every
# request. 1000 images is 500k comparisons, comfortably sub-second in
# Python and generous for the personal-scale libraries this project is
# built around.
DUPLICATE_SCAN_LIMIT = 1000
DUPLICATE_HAMMING_THRESHOLD = 4
STACK_HAMMING_THRESHOLD = 10
STACK_TIME_WINDOW_SECONDS = 120

# Same bounded-scan reasoning as DUPLICATE_SCAN_LIMIT: the map view reads
# one HEAD's worth of metadata per image, so this keeps a single request
# to a comfortable number of round trips against S3.
MAP_SCAN_LIMIT = 1000

# How many prior versions to keep per file. Each version is a full copy
# of the bytes, so this is a real storage-cost knob, not just metadata —
# bounded rather than unlimited for exactly that reason. Once an item
# exceeds this, the oldest version's object and record are removed.
MAX_VERSIONS_PER_ITEM = 10


def _hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


class FileService:
    def __init__(
        self,
        items: ItemRepository,
        storage: ObjectStorage,
        versions: VersionRepository | None = None,
    ):
        self._items = items
        self._storage = storage
        self._versions = versions

    # --- helpers -------------------------------------------------------

    @staticmethod
    def not_found() -> HTTPException:
        # Deliberately identical for "absent" and "owned by someone else",
        # so responses cannot be used to probe for other users' item ids.
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")

    # Internal alias kept so existing call sites read naturally.
    _not_found = not_found

    @staticmethod
    def _clamp(limit: int) -> int:
        return max(1, min(limit, MAX_PAGE_SIZE))

    async def _require_item(self, user_id: str, item_id: str) -> Item:
        item = await self._items.get(user_id, item_id)
        if item is None:
            raise self._not_found()
        return item

    async def _validate_parent(self, user_id: str, parent_id: str | None) -> None:
        if parent_id is None:
            return
        parent = await self._items.get(user_id, parent_id)
        if parent is None:
            raise self._not_found()
        if not parent.is_folder:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent must be a folder.",
            )

    async def _assert_no_cycle(self, user_id: str, folder_id: str, target_parent: str | None):
        """Reject moving a folder inside itself or its own descendants.

        Without this the subtree is orphaned: it disappears from the tree
        while its documents still exist, and listing never reaches it.
        """
        cursor = target_parent
        while cursor is not None:
            if cursor == folder_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot move a folder into itself or its own subfolder.",
                )
            node = await self._items.get(user_id, cursor)
            if node is None:
                break
            cursor = node.parent_id

    async def _unique_name(self, user_id: str, parent_id: str | None, name: str) -> str:
        """Append " (2)", " (3)"… when the name is already taken.

        Mirrors what a desktop file manager does. Without it two uploads of
        the same filename silently produce two indistinguishable rows.
        """
        if not await self._items.name_exists(user_id, parent_id, name):
            return name

        stem, dot, ext = name.rpartition(".")
        base, suffix = (stem, f".{ext}") if dot else (name, "")

        for counter in range(2, 100):
            candidate = f"{base} ({counter}){suffix}"
            if not await self._items.name_exists(user_id, parent_id, candidate):
                return candidate
        # Astronomically unlikely; fall back to something certainly unique.
        return f"{base} ({uuid4().hex[:6]}){suffix}"

    # --- reads ---------------------------------------------------------

    async def list_children(
        self, user_id: str, parent_id: str | None, *, offset: int, limit: int, sort: str
    ) -> tuple[list[Item], int]:
        await self._validate_parent(user_id, parent_id)
        return await self._items.list_children(
            user_id, parent_id, offset=max(0, offset), limit=self._clamp(limit), sort=sort
        )

    async def list_photos(
        self, user_id: str, *, offset: int, limit: int
    ) -> tuple[list[Item], int]:
        return await self._items.list_images(
            user_id, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def list_videos(
        self, user_id: str, *, offset: int, limit: int
    ) -> tuple[list[Item], int]:
        return await self._items.list_videos(
            user_id, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def search(
        self,
        user_id: str,
        term: str,
        *,
        offset: int,
        limit: int,
        item_type: str | None = None,
        category: str | None = None,
        min_size: int | None = None,
        max_size: int | None = None,
        updated_after: datetime | None = None,
        updated_before: datetime | None = None,
    ) -> tuple[list[Item], int]:
        term = term.strip()
        if not term:
            return [], 0
        return await self._items.search(
            user_id,
            term,
            offset=max(0, offset),
            limit=self._clamp(limit),
            item_type=item_type,
            category=category,
            min_size=min_size,
            max_size=max_size,
            updated_after=updated_after,
            updated_before=updated_before,
        )

    async def recent(self, user_id: str, *, limit: int = 20) -> list[Item]:
        return await self._items.list_recent(user_id, limit=self._clamp(limit))

    async def on_this_day(self, user_id: str) -> list[Item]:
        return await self._items.on_this_day(user_id)

    async def list_trash(self, user_id: str, *, offset: int, limit: int) -> tuple[list[Item], int]:
        return await self._items.list_trashed(
            user_id, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def usage(self, user_id: str) -> tuple[int, int, int]:
        return await self._items.usage(user_id)

    async def usage_detail(self, user_id: str):
        stored, files, folders = await self._items.usage(user_id)
        by_category = await self._items.usage_by_category(user_id)
        trashed, _ = await self._items.list_trashed(user_id, offset=0, limit=MAX_PAGE_SIZE)
        trashed_bytes = sum(i.size or 0 for i in trashed)
        return stored, files, folders, len(trashed), trashed_bytes, by_category

    # --- duplicate detection / photo stacks -----------------------------
    #
    # Opportunistic: the thumbnailer Lambda already computes a perceptual
    # hash for every image it thumbnails and stores it as metadata on the
    # thumbnail object (see thumbnailer/app.py). This just reads that back
    # and clusters — no new service, no write path here at all. An image
    # uploaded before this feature shipped, or whose thumbnail failed,
    # simply has no hash yet and is skipped rather than erroring.

    async def _hashed_images(self, user_id: str) -> list[tuple[Item, str]]:
        images, _ = await self._items.list_images(
            user_id, offset=0, limit=DUPLICATE_SCAN_LIMIT
        )
        out: list[tuple[Item, str]] = []
        for item in images:
            if not item.s3_key:
                continue
            meta = self._storage.metadata(thumbnail_key(item.s3_key))
            phash = meta.get("phash") if meta else None
            if phash:
                out.append((item, phash))
        return out

    @staticmethod
    def _cluster(
        hashed: list[tuple[Item, str]], *, max_distance: int, max_seconds: float | None
    ) -> list[list[Item]]:
        """Single-link clustering: union any two images within
        `max_distance` bits of each other (and, if given, within
        `max_seconds` of each other's capture time)."""
        n = len(hashed)
        parent = list(range(n))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for i in range(n):
            item_i, hash_i = hashed[i]
            for j in range(i + 1, n):
                item_j, hash_j = hashed[j]
                if _hamming(hash_i, hash_j) > max_distance:
                    continue
                if max_seconds is not None:
                    t_i = item_i.taken_at or item_i.created_at
                    t_j = item_j.taken_at or item_j.created_at
                    if abs((t_i - t_j).total_seconds()) > max_seconds:
                        continue
                union(i, j)

        groups: dict[int, list[Item]] = {}
        for i, (item, _phash) in enumerate(hashed):
            groups.setdefault(find(i), []).append(item)
        return [g for g in groups.values() if len(g) >= 2]

    async def find_duplicates(self, user_id: str) -> list[list[Item]]:
        hashed = await self._hashed_images(user_id)
        return self._cluster(hashed, max_distance=DUPLICATE_HAMMING_THRESHOLD, max_seconds=None)

    async def find_photo_stacks(self, user_id: str) -> list[list[Item]]:
        hashed = await self._hashed_images(user_id)
        return self._cluster(
            hashed, max_distance=STACK_HAMMING_THRESHOLD, max_seconds=STACK_TIME_WINDOW_SECONDS
        )

    # --- map view --------------------------------------------------------
    #
    # Same opportunistic pattern as duplicate detection: the thumbnailer
    # Lambda already extracts GPS EXIF, when present, into the thumbnail
    # object's metadata. This just reads it back. A photo with no GPS tag
    # (the common case) is silently omitted rather than erroring.

    async def geo_photos(self, user_id: str) -> list[tuple[Item, float, float]]:
        images, _ = await self._items.list_images(user_id, offset=0, limit=MAP_SCAN_LIMIT)
        out: list[tuple[Item, float, float]] = []
        for item in images:
            if not item.s3_key:
                continue
            meta = self._storage.metadata(thumbnail_key(item.s3_key))
            if not meta:
                continue
            lat_raw, lon_raw = meta.get("lat"), meta.get("lon")
            if lat_raw is None or lon_raw is None:
                continue
            try:
                out.append((item, float(lat_raw), float(lon_raw)))
            except ValueError:
                continue
        return out

    # --- creation ------------------------------------------------------

    async def create_folder(self, user_id: str, name: str, parent_id: str | None) -> Item:
        await self._validate_parent(user_id, parent_id)
        name = await self._unique_name(user_id, parent_id, name)
        return await self._items.create_folder(user_id, name, parent_id)

    async def start_upload(
        self, user_id: str, name: str, parent_id: str | None, content_type: str | None
    ) -> tuple[Item, str]:
        await self._validate_parent(user_id, parent_id)
        name = await self._unique_name(user_id, parent_id, name)
        try:
            key = build_user_key(user_id, f"files/{uuid4().hex}")
        except InvalidObjectKey as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

        item = await self._items.create_pending_file(user_id, name, parent_id, key, content_type)
        url = self._storage.upload_url(key, content_type=content_type)
        return item, url

    async def start_multipart_upload(
        self,
        user_id: str,
        name: str,
        parent_id: str | None,
        content_type: str | None,
        part_count: int,
    ) -> tuple[Item, str, list[str]]:
        """Large-file variant of start_upload: the browser PUTs each part
        directly to S3 (same never-proxy-bytes principle), so one flaky
        part can be retried instead of restarting a multi-gigabyte
        upload from zero."""
        if not (1 <= part_count <= 10_000):  # S3's own hard cap on parts
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="part_count must be between 1 and 10000.",
            )
        await self._validate_parent(user_id, parent_id)
        name = await self._unique_name(user_id, parent_id, name)
        try:
            key = build_user_key(user_id, f"files/{uuid4().hex}")
        except InvalidObjectKey as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

        item = await self._items.create_pending_file(user_id, name, parent_id, key, content_type)
        upload_id = self._storage.create_multipart_upload(key, content_type=content_type)
        part_urls = [self._storage.presign_part(key, upload_id, n) for n in range(1, part_count + 1)]
        return item, upload_id, part_urls

    async def complete_multipart_upload(
        self, user_id: str, item_id: str, upload_id: str, parts: list[tuple[int, str]]
    ) -> Item:
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not an uploadable file."
            )
        self._storage.complete_multipart_upload(item.s3_key, upload_id, parts)
        return await self.complete_upload(user_id, item_id)

    async def abort_multipart_upload(self, user_id: str, item_id: str, upload_id: str) -> None:
        item = await self._require_item(user_id, item_id)
        if item.s3_key:
            self._storage.abort_multipart_upload(item.s3_key, upload_id)
        # The item never finished uploading, so there's nothing worth
        # keeping around as a permanently-pending row.
        await self._items.hard_delete(user_id, item_id)

    async def complete_upload(
        self, user_id: str, item_id: str, *, content_type: str | None = None
    ) -> Item:
        """Confirm an upload by checking S3 directly.

        The size is read from S3 rather than taken from the client, so a
        caller cannot under-report usage or mark a file ready that was
        never actually uploaded. `content_type` is only passed by the
        in-place-edit flow, where the saved bytes are always a re-encoded
        JPEG regardless of the original format.
        """
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not an uploadable file."
            )

        size = self._storage.size(item.s3_key)
        if size is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No uploaded object found for this item yet.",
            )

        updated = await self._items.mark_ready(user_id, item_id, size, content_type=content_type)
        if updated is None:  # pragma: no cover - lost a concurrent delete
            raise self._not_found()
        return updated

    async def start_replace(self, user_id: str, item_id: str) -> str:
        """Presigned URL to overwrite an existing image's bytes in place.

        Used by in-browser editing (crop/rotate/brightness/contrast).
        Reuses the item's existing S3 key rather than minting a new one,
        so the item's id, name, and folder are untouched — only its
        content changes. The PUT re-fires the same S3 ObjectCreated event
        the thumbnailer already listens for, so the thumbnail, perceptual
        hash, and GPS metadata all regenerate for free.

        Snapshots the current bytes as a version first (when versioning
        is wired up), so an edit is undoable via version history. Still a
        destructive overwrite of the *current* object, so the frontend
        must confirm before calling it.
        """
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not an editable file."
            )
        if not (item.content_type or "").startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Only images can be edited."
            )
        await self._snapshot_version(user_id, item)
        return self._storage.upload_url(item.s3_key, content_type="image/jpeg")

    # --- versioning ----------------------------------------------------
    #
    # Application-level, not S3 bucket versioning: each snapshot is its
    # own object under the user's prefix, tracked by its own document, so
    # retention is bounded (MAX_VERSIONS_PER_ITEM) rather than relying on
    # a bucket-wide lifecycle policy. The item's own s3_key always points
    # at the *current* bytes; versions point elsewhere.

    async def _snapshot_version(self, user_id: str, item: Item) -> None:
        """Copy the item's current object to a version key and record it,
        then evict the oldest if the item is over the retention cap.

        A no-op when versioning isn't wired up (no repository) or the
        item has no bytes yet — so callers can invoke it unconditionally.
        """
        if self._versions is None or not item.s3_key:
            return
        if not is_owned_by(item.s3_key, user_id):  # pragma: no cover - defensive
            return
        # Nothing to snapshot if the current object doesn't exist yet.
        size = self._storage.size(item.s3_key)
        if size is None:
            return

        try:
            version_key = build_user_key(user_id, f"versions/{uuid4().hex}")
        except InvalidObjectKey as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

        self._storage.copy(item.s3_key, version_key)
        number = await self._versions.next_version_number(user_id, item.id)
        await self._versions.create(
            user_id,
            item.id,
            version_number=number,
            s3_key=version_key,
            size=size,
            content_type=item.content_type,
            name=item.name,
        )

        # Evict oldest beyond the cap — object and record — so an item's
        # version history can't grow storage without bound.
        while await self._versions.count_for_item(user_id, item.id) > MAX_VERSIONS_PER_ITEM:
            oldest = await self._versions.oldest_for_item(user_id, item.id)
            if oldest is None:  # pragma: no cover - race
                break
            self._delete_version_object(oldest, user_id)
            await self._versions.delete(user_id, oldest.id)

    def _delete_version_object(self, version: FileVersion, user_id: str) -> None:
        if not version.s3_key or not is_owned_by(version.s3_key, user_id):
            return
        try:
            self._storage.delete(version.s3_key)
            self._storage.delete(thumbnail_key(version.s3_key))
        except Exception:  # pragma: no cover - best effort
            logger.exception("Failed deleting version object %s", version.s3_key)

    async def list_versions(self, user_id: str, item_id: str) -> list[FileVersion]:
        await self._require_item(user_id, item_id)
        if self._versions is None:
            return []
        return await self._versions.list_for_item(user_id, item_id)

    async def start_new_version(self, user_id: str, item_id: str) -> str:
        """Presigned URL to upload replacement bytes for any file, keeping
        the current bytes as a version. Unlike start_replace (image
        editor, re-encodes to JPEG) this preserves the item's own content
        type, since the new upload is the same kind of file."""
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not a file."
            )
        await self._snapshot_version(user_id, item)
        return self._storage.upload_url(item.s3_key, content_type=item.content_type)

    async def restore_version(self, user_id: str, item_id: str, version_id: str) -> Item:
        """Make a prior version the current bytes. Snapshots the current
        state first, so a restore is itself undoable."""
        item = await self._require_item(user_id, item_id)
        if self._versions is None:
            raise self._not_found()
        version = await self._versions.get(user_id, version_id)
        if version is None or version.item_id != item_id or not item.s3_key:
            raise self._not_found()
        if not is_owned_by(version.s3_key, user_id):  # pragma: no cover - defensive
            raise self._not_found()

        # Keep the current bytes recoverable before overwriting them.
        await self._snapshot_version(user_id, item)
        # Overwrite the current object with the version's bytes. This
        # re-fires ObjectCreated, so thumbnail/hash/GPS regenerate.
        self._storage.copy(version.s3_key, item.s3_key)
        size = self._storage.size(item.s3_key)
        updated = await self._items.mark_ready(
            user_id, item_id, size or 0, content_type=version.content_type
        )
        if updated is None:  # pragma: no cover - lost a concurrent delete
            raise self._not_found()
        return updated

    async def version_download_url(
        self, user_id: str, item_id: str, version_id: str
    ) -> tuple[str, int]:
        await self._require_item(user_id, item_id)
        if self._versions is None:
            raise self._not_found()
        version = await self._versions.get(user_id, version_id)
        if version is None or version.item_id != item_id:
            raise self._not_found()
        if not is_owned_by(version.s3_key, user_id):  # pragma: no cover - defensive
            raise self._not_found()
        return (
            self._storage.download_url(version.s3_key, filename=version.name),
            settings.PRESIGNED_URL_EXPIRE_SECONDS,
        )

    # --- urls ----------------------------------------------------------

    async def download_url(self, user_id: str, item_id: str) -> tuple[str, int]:
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Folders cannot be downloaded."
            )
        if item.status is not UploadStatus.READY:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Upload has not completed."
            )
        # Defence in depth: the key came from our own database, but verify
        # it still falls inside this user's prefix before signing it.
        if not is_owned_by(item.s3_key, user_id):
            logger.error("Key %s is outside the prefix for user %s", item.s3_key, user_id)
            raise self._not_found()
        return self._storage.download_url(item.s3_key, filename=item.name), (
            settings.PRESIGNED_URL_EXPIRE_SECONDS
        )

    async def preview_url(self, user_id: str, item_id: str) -> tuple[str, int]:
        """Signed URL rendered inline rather than downloaded.

        Same object as the download URL, minus the attachment disposition,
        so the browser displays images and PDFs in place.
        """
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key or item.status is not UploadStatus.READY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item cannot be previewed."
            )
        if not is_owned_by(item.s3_key, user_id):
            raise self._not_found()
        return self._storage.download_url(item.s3_key), settings.PRESIGNED_URL_EXPIRE_SECONDS

    async def thumbnail_url(self, user_id: str, item_id: str) -> tuple[str, bool]:
        item = await self._require_item(user_id, item_id)
        return self._thumbnail_for(item, user_id)

    def _thumbnail_for(self, item: Item, user_id: str) -> tuple[str, bool]:
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not a file."
            )
        if not is_owned_by(item.s3_key, user_id):
            logger.error("Key %s is outside the prefix for user %s", item.s3_key, user_id)
            raise self._not_found()

        thumb = thumbnail_key(item.s3_key)
        if self._storage.exists(thumb):
            return self._storage.download_url(thumb), True
        return self._storage.download_url(item.s3_key, filename=item.name), False

    async def thumbnail_urls(
        self, user_id: str, item_ids: list[str]
    ) -> list[tuple[str, str, bool]]:
        """Sign many thumbnails in one request.

        Signing is local computation — no S3 round trip — so the only
        per-item cost is the existence check. Doing this in one call
        instead of one call per tile is the difference between a photo
        grid costing one Lambda invocation and costing hundreds.
        """
        out: list[tuple[str, str, bool]] = []
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id)
            if item is None or item.is_folder or not item.s3_key:
                continue
            try:
                url, is_thumb = self._thumbnail_for(item, user_id)
            except HTTPException:
                continue
            out.append((item_id, url, is_thumb))
        return out

    # --- mutation ------------------------------------------------------

    async def update(
        self,
        user_id: str,
        item_id: str,
        name: str | None,
        parent_id: str | None,
        move: bool,
        *,
        set_color: bool = False,
        color: str | None = None,
    ) -> Item:
        item = await self._require_item(user_id, item_id)
        if move:
            await self._validate_parent(user_id, parent_id)
            if item.is_folder:
                await self._assert_no_cycle(user_id, item_id, parent_id)
        if name is not None and name != item.name:
            target_parent = parent_id if move else item.parent_id
            name = await self._unique_name(user_id, target_parent, name)

        updated = await self._items.rename_or_move(
            user_id,
            item_id,
            name=name,
            parent_id=parent_id,
            move=move,
            set_color=set_color,
            color=color,
        )
        if updated is None:  # pragma: no cover
            raise self._not_found()
        return updated

    async def star(self, user_id: str, item_ids: list[str]) -> int:
        return await self._items.set_starred(user_id, item_ids, True)

    async def unstar(self, user_id: str, item_ids: list[str]) -> int:
        return await self._items.set_starred(user_id, item_ids, False)

    async def list_starred(
        self, user_id: str, *, offset: int, limit: int
    ) -> tuple[list[Item], int]:
        return await self._items.list_starred(
            user_id, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def move_many(self, user_id: str, item_ids: list[str], parent_id: str | None) -> int:
        await self._validate_parent(user_id, parent_id)
        moved = 0
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id)
            if item is None:
                continue
            if item.is_folder:
                # Skipped rather than aborting the batch: one invalid move
                # should not undo the others.
                try:
                    await self._assert_no_cycle(user_id, item_id, parent_id)
                except HTTPException:
                    continue
            name = await self._unique_name(user_id, parent_id, item.name)
            result = await self._items.rename_or_move(
                user_id, item_id, name=name, parent_id=parent_id, move=True
            )
            if result is not None:
                moved += 1
        return moved

    async def trash(self, user_id: str, item_ids: list[str]) -> int:
        """Move items (and folder contents) to the trash.

        Descendants are trashed too, otherwise they would be unreachable
        through the tree while still counting toward usage.
        """
        targets: list[str] = []
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id)
            if item is None:
                continue
            targets.append(item.id)
            if item.is_folder:
                targets.extend(d.id for d in await self._items.descendants(user_id, item.id))
        if not targets:
            return 0
        return await self._items.trash(user_id, list(dict.fromkeys(targets)))

    async def restore(self, user_id: str, item_ids: list[str]) -> int:
        return await self._items.restore(user_id, item_ids)

    async def delete_permanently(self, user_id: str, item_ids: list[str]) -> int:
        """Remove items and their bytes for good."""
        removed = 0
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id, include_trashed=True)
            if item is None:
                continue
            self._remove_objects(item, user_id)
            await self._remove_versions(user_id, item.id)
            if await self._items.hard_delete(user_id, item.id):
                removed += 1
        return removed

    async def _remove_versions(self, user_id: str, item_id: str) -> None:
        """Delete every version object + record for an item — otherwise a
        permanently-deleted file's old versions would sit in the bucket
        costing storage forever."""
        if self._versions is None:
            return
        for version in await self._versions.list_all_for_item(user_id, item_id):
            self._delete_version_object(version, user_id)
        await self._versions.delete_all_for_item(user_id, item_id)

    def _remove_objects(self, item: Item, user_id: str) -> None:
        if not item.s3_key or not is_owned_by(item.s3_key, user_id):
            return
        try:
            self._storage.delete(item.s3_key)
            # Thumbnails live outside the user prefix, so nothing else
            # would ever collect them; an orphan sits in the bucket
            # costing money indefinitely. Delete is idempotent.
            self._storage.delete(thumbnail_key(item.s3_key))
        except Exception:
            logger.exception("Failed deleting objects for %s", item.s3_key)
