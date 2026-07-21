#!/usr/bin/env python3
"""Generate thumbnails for images uploaded before the thumbnailer existed.

New uploads need nothing: any S3 PUT fires ObjectCreated, so both browser
uploads and the Takeout migration get thumbnails automatically. This is
only for objects already in the bucket when the trigger was wired up.

It invokes the Lambda with a synthetic event per object rather than
re-uploading, so no bytes move and nothing is rewritten.

Usage:
    python scripts/backfill_thumbnails.py                 # report only
    python scripts/backfill_thumbnails.py --apply
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import boto3  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.storage.keys import thumbnail_key  # noqa: E402

FUNCTION_NAME = "nimbus-thumbnailer"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually invoke the Lambda.")
    parser.add_argument("--function", default=FUNCTION_NAME)
    args = parser.parse_args()

    bucket = settings.S3_BUCKET_NAME
    s3 = boto3.client("s3", region_name=settings.S3_REGION)
    lam = boto3.client("lambda", region_name=settings.S3_REGION)

    existing_thumbs: set[str] = set()
    originals: list[str] = []

    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.startswith("thumbnails/"):
                existing_thumbs.add(key)
            elif key.startswith("users/"):
                originals.append(key)

    missing = [k for k in originals if thumbnail_key(k) not in existing_thumbs]

    print(f"objects under users/: {len(originals)}")
    print(f"existing thumbnails : {len(existing_thumbs)}")
    print(f"missing thumbnails  : {len(missing)}")

    if not missing:
        return
    if not args.apply:
        for key in missing[:20]:
            print(f"  would process {key}")
        if len(missing) > 20:
            print(f"  ... and {len(missing) - 20} more")
        print("\nRe-run with --apply to generate them.")
        return

    generated = 0
    for key in missing:
        # Same shape the S3 notification produces, so the handler needs no
        # special path for backfilled objects.
        event = {"Records": [{"s3": {"bucket": {"name": bucket}, "object": {"key": key}}}]}
        response = lam.invoke(
            FunctionName=args.function,
            InvocationType="RequestResponse",
            Payload=json.dumps(event).encode(),
        )
        result = json.loads(response["Payload"].read() or b"{}")
        made = result.get("generated", 0)
        generated += made
        print(f"  {key} -> {'generated' if made else 'skipped (not an image)'}")

    print(f"\nDone. {generated} thumbnail(s) generated.")


if __name__ == "__main__":
    main()
