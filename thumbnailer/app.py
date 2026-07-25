"""S3 ObjectCreated -> thumbnail generator.

Triggered on new objects under ``users/``, writes a JPEG thumbnail to the
matching ``thumbnails/`` key. Deliberately standalone: it shares no code
with the API and touches no database, so it needs only Pillow and boto3
and can compute its destination key from the event alone.

Recursion safety rests on the prefix split — the notification is scoped
to ``users/`` and output goes to ``thumbnails/``, so generated files
cannot re-trigger it. That invariant must hold if either prefix changes.
"""

import logging
import os
import urllib.parse
from io import BytesIO

import boto3
from PIL import Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

MAX_EDGE = int(os.environ.get("THUMBNAIL_MAX_EDGE", "512"))
# Above this, decoding risks exhausting the function's memory. Such files
# are skipped rather than crashing the invocation.
MAX_SOURCE_BYTES = int(os.environ.get("THUMBNAIL_MAX_SOURCE_BYTES", str(40 * 1024 * 1024)))

SOURCE_PREFIX = "users/"
THUMBNAIL_PREFIX = "thumbnails/"


def thumbnail_key(object_key: str) -> str:
    """Mirror of app.storage.keys.thumbnail_key; kept in step by tests."""
    return f"{THUMBNAIL_PREFIX}{object_key[len(SOURCE_PREFIX):]}.jpg"


def _is_image(bucket: str, key: str) -> bool:
    head = s3.head_object(Bucket=bucket, Key=key)
    content_type = (head.get("ContentType") or "").lower()
    if head["ContentLength"] > MAX_SOURCE_BYTES:
        logger.info("Skipping %s: %d bytes exceeds limit", key, head["ContentLength"])
        return False
    return content_type.startswith("image/")


def _compute_phash(image: Image.Image) -> str:
    """8x8 difference hash (dHash) — deliberately Pillow-only rather than
    pulling in a dedicated perceptual-hashing library, to keep the
    Lambda's dependency footprint at just Pillow + boto3.

    Hamming distance between two hashes approximates visual similarity.
    Used for opportunistic duplicate detection and photo stacking — a
    nice-to-have grouping signal, not anything that needs to be exact.
    """
    small = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    bits = []
    for row in range(8):
        row_pixels = pixels[row * 9 : row * 9 + 9]
        bits.extend("1" if row_pixels[col] > row_pixels[col + 1] else "0" for col in range(8))
    return f"{int(''.join(bits), 2):016x}"


def _build_thumbnail(raw: bytes) -> tuple[bytes, str]:
    with Image.open(BytesIO(raw)) as image:
        # Phone photos carry orientation in EXIF; without this the
        # thumbnail comes out rotated even though the original looks fine.
        image = ImageOps.exif_transpose(image)
        # JPEG has no alpha channel, so flatten anything that does.
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")

        phash = _compute_phash(image)

        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=82, optimize=True, progressive=True)
        return buffer.getvalue(), phash


def handler(event, _context):
    generated = 0

    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        # S3 percent-encodes keys in notifications, and turns spaces into '+'.
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])

        if not key.startswith(SOURCE_PREFIX):
            logger.info("Ignoring %s: outside %s", key, SOURCE_PREFIX)
            continue

        try:
            if not _is_image(bucket, key):
                continue

            raw = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            thumbnail, phash = _build_thumbnail(raw)
            destination = thumbnail_key(key)

            s3.put_object(
                Bucket=bucket,
                Key=destination,
                Body=thumbnail,
                ContentType="image/jpeg",
                CacheControl="public, max-age=31536000, immutable",
                # Piggybacks the perceptual hash on the thumbnail object's
                # metadata rather than writing to Mongo — this Lambda
                # deliberately has no database access, and object
                # metadata is free to attach to a PUT it's already doing.
                Metadata={"phash": phash},
            )
            generated += 1
            logger.info("Wrote %s (%d bytes)", destination, len(thumbnail))

        except UnidentifiedImageError:
            # Mislabelled content type, or a format Pillow cannot read.
            logger.warning("Not a decodable image: %s", key)
        except Exception:
            # Never re-raise: a failed thumbnail must not retry forever or
            # block anything. The original object is already safe.
            logger.exception("Thumbnail generation failed for %s", key)

    return {"generated": generated}
