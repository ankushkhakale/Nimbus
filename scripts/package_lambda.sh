#!/usr/bin/env bash
# Build and zip the Nimbus Lambda deployment package.
#
# Run from the repo root. Requires SAM CLI and a working Docker daemon —
# the container build produces Linux x86_64 wheels for the native
# dependencies (bcrypt, pydantic-core, cryptography), which a local
# non-Linux or mismatched-Python build would get wrong.
#
# Usage: scripts/package_lambda.sh [output.zip]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT/.aws-sam/build/NimbusFunction"
OUT="${1:-$ROOT/.aws-sam/nimbus-api.zip}"

echo "==> Building (container)"
(cd "$ROOT" && sam build --use-container >/dev/null)

# The Lambda Python runtime ships boto3/botocore already. Bundling them
# adds ~40MB to every upload and slows cold starts for no benefit. They
# stay in requirements.txt so non-Lambda environments still install them.
echo "==> Pruning runtime-provided packages"
for pkg in boto3 botocore; do
  rm -rf "$BUILD_DIR/$pkg" "$BUILD_DIR/$pkg"-*.dist-info
done

# Bytecode is regenerated on cold start and only inflates the upload.
find "$BUILD_DIR" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$BUILD_DIR" -name '*.pyc' -delete 2>/dev/null || true

echo "==> Zipping"
rm -f "$OUT"
(cd "$BUILD_DIR" && zip -qr "$OUT" .)

echo "==> Done: $OUT ($(du -h "$OUT" | cut -f1)), unpacked $(du -sh "$BUILD_DIR" | cut -f1)"

# --- thumbnailer -------------------------------------------------------
# Built separately: it shares no code with the API and needs only Pillow,
# so bundling them together would put a 40MB imaging library in the API's
# cold-start path for no reason.
THUMB_OUT="${2:-$ROOT/.aws-sam/nimbus-thumbnailer.zip}"
THUMB_STAGE="$ROOT/.aws-sam/thumbnailer-build"

echo "==> Building thumbnailer"
rm -rf "$THUMB_STAGE"
mkdir -p "$THUMB_STAGE"
# Pillow ships compiled extensions, so wheels must match the Lambda
# runtime rather than whatever Python is on this machine.
pip install -q \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.13 \
  --only-binary=:all: \
  --target "$THUMB_STAGE" \
  -r "$ROOT/thumbnailer/requirements.txt"
cp "$ROOT/thumbnailer/app.py" "$THUMB_STAGE/app.py"
find "$THUMB_STAGE" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true

rm -f "$THUMB_OUT"
(cd "$THUMB_STAGE" && zip -qr "$THUMB_OUT" .)
echo "==> Done: $THUMB_OUT ($(du -h "$THUMB_OUT" | cut -f1))"
