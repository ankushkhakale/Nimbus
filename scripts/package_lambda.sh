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
