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
import subprocess
import tempfile
import urllib.parse
from io import BytesIO

import boto3
from PIL import ExifTags, Image, ImageOps, UnidentifiedImageError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

MAX_EDGE = int(os.environ.get("THUMBNAIL_MAX_EDGE", "512"))
# Above this, decoding risks exhausting the function's memory. Such files
# are skipped rather than crashing the invocation.
MAX_SOURCE_BYTES = int(os.environ.get("THUMBNAIL_MAX_SOURCE_BYTES", str(40 * 1024 * 1024)))
# Videos are read whole into /tmp for ffmpeg (which needs a seekable
# file), so this stays comfortably under the function's default 512MB
# ephemeral storage rather than matching the image limit.
MAX_VIDEO_SOURCE_BYTES = int(
    os.environ.get("THUMBNAIL_MAX_VIDEO_SOURCE_BYTES", str(200 * 1024 * 1024))
)
# Provided by an optional Lambda layer (see infra/nimbus-backend.yaml's
# FfmpegLayerArn parameter) — absent by default, in which case this path
# simply doesn't exist and video thumbnailing quietly no-ops.
FFMPEG_BIN = os.environ.get("FFMPEG_BIN", "/opt/bin/ffmpeg")

SOURCE_PREFIX = "users/"
THUMBNAIL_PREFIX = "thumbnails/"


def thumbnail_key(object_key: str) -> str:
    """Mirror of app.storage.keys.thumbnail_key; kept in step by tests."""
    return f"{THUMBNAIL_PREFIX}{object_key[len(SOURCE_PREFIX):]}.jpg"


def _head(bucket: str, key: str) -> tuple[str, int]:
    head = s3.head_object(Bucket=bucket, Key=key)
    return (head.get("ContentType") or "").lower(), head["ContentLength"]


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


def _extract_gps(image: Image.Image) -> tuple[float, float] | None:
    """Decimal-degree (lat, lon) from EXIF GPS tags, if present.

    Most photos have none — GPS is opportunistic, stripped by many apps,
    and never required for anything else in this pipeline. Read before
    any transform touches the image, since only the original PIL object
    reliably exposes ``getexif()``.
    """
    try:
        gps_ifd = image.getexif().get_ifd(ExifTags.IFD.GPSInfo)
    except Exception:
        return None
    if not gps_ifd:
        return None

    def _to_degrees(value, ref) -> float | None:
        try:
            d, m, s = (float(x) for x in value)
        except (TypeError, ValueError):
            return None
        degrees = d + m / 60 + s / 3600
        return -degrees if ref in ("S", "W") else degrees

    lat = _to_degrees(gps_ifd.get(2), gps_ifd.get(1))
    lon = _to_degrees(gps_ifd.get(4), gps_ifd.get(3))
    if lat is None or lon is None:
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return lat, lon


def _build_thumbnail(raw: bytes) -> tuple[bytes, str, tuple[float, float] | None]:
    with Image.open(BytesIO(raw)) as image:
        gps = _extract_gps(image)

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
        return buffer.getvalue(), phash, gps


def _build_video_thumbnail(raw: bytes) -> bytes | None:
    """Grab one JPEG frame via ffmpeg, if the layer providing it is
    attached (FFMPEG_BIN). Returns None rather than raising when the
    binary is missing, the clip is unreadable, or ffmpeg times out — a
    video simply falls back to its original file when there's no
    thumbnail, exactly as it does today, so this is never fatal.
    """
    if not os.path.exists(FFMPEG_BIN):
        return None
    with tempfile.NamedTemporaryFile(suffix=".mp4") as src:
        src.write(raw)
        src.flush()
        try:
            result = subprocess.run(
                [
                    FFMPEG_BIN,
                    "-y",
                    "-ss",
                    "00:00:01.000",
                    "-i",
                    src.name,
                    "-frames:v",
                    "1",
                    "-vf",
                    f"scale='min({MAX_EDGE},iw)':'min({MAX_EDGE},ih)':force_original_aspect_ratio=decrease",
                    "-f",
                    "image2",
                    "-c:v",
                    "mjpeg",
                    "pipe:1",
                ],
                capture_output=True,
                timeout=45,
            )
        except subprocess.TimeoutExpired:
            logger.warning("ffmpeg timed out extracting a video frame")
            return None
    if result.returncode != 0 or not result.stdout:
        logger.warning("ffmpeg failed to extract a video frame: %s", result.stderr[-500:])
        return None
    return result.stdout


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
            content_type, size = _head(bucket, key)
            is_image = content_type.startswith("image/")
            is_video = content_type.startswith("video/")
            if not is_image and not is_video:
                continue

            limit = MAX_VIDEO_SOURCE_BYTES if is_video else MAX_SOURCE_BYTES
            if size > limit:
                logger.info("Skipping %s: %d bytes exceeds limit", key, size)
                continue

            raw = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
            destination = thumbnail_key(key)

            if is_video:
                thumbnail = _build_video_thumbnail(raw)
                if thumbnail is None:
                    continue
                metadata = {}
            else:
                thumbnail, phash, gps = _build_thumbnail(raw)
                # Piggybacks derived data on the thumbnail object's own
                # metadata rather than writing to Mongo — this Lambda
                # deliberately has no database access, and object
                # metadata is free to attach to a PUT it's already doing.
                metadata = {"phash": phash}
                if gps is not None:
                    metadata["lat"] = f"{gps[0]:.6f}"
                    metadata["lon"] = f"{gps[1]:.6f}"

            s3.put_object(
                Bucket=bucket,
                Key=destination,
                Body=thumbnail,
                ContentType="image/jpeg",
                CacheControl="public, max-age=31536000, immutable",
                Metadata=metadata,
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
