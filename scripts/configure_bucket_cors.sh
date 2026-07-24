#!/usr/bin/env bash
# Set the S3 bucket's CORS to exactly the origins the app is served from.
#
# The browser uploads and downloads directly to/from S3 (presigned URLs),
# so the BUCKET — not just the API — must allow the frontend's origin, or
# every transfer fails in the browser as an opaque "network error" while
# the API itself looks perfectly healthy. This bit us once: the bucket
# was left allowing only localhost after early testing, so uploads from
# the deployed site silently failed.
#
# The bucket predates the CloudFormation stack and is not managed by it,
# so this runs as a deploy step instead. It is declarative — one
# put-bucket-cors replaces the whole config — so running it on every
# deploy re-asserts the correct origins and cannot drift.
#
# Origins come from the SAME comma-separated list the API's CORS uses
# (CORS_ORIGINS), so the two layers can never disagree.
#
# Usage: scripts/configure_bucket_cors.sh <bucket> "<origin1,origin2,...>" [region]
set -euo pipefail

BUCKET="${1:?usage: configure_bucket_cors.sh <bucket> <origins-csv> [region]}"
ORIGINS_CSV="${2:?need the comma-separated origins list}"
REGION="${3:-ap-south-1}"

# Turn "a,b" into a JSON array ["a","b"], trimming whitespace and blanks.
origins_json=$(
  printf '%s' "$ORIGINS_CSV" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$' |
    python3 -c 'import json,sys; print(json.dumps([l.strip() for l in sys.stdin if l.strip()]))'
)

echo "==> Setting CORS on s3://$BUCKET to: $origins_json"

aws s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --cors-configuration "{
    \"CORSRules\": [{
      \"AllowedOrigins\": $origins_json,
      \"AllowedMethods\": [\"GET\", \"PUT\", \"HEAD\"],
      \"AllowedHeaders\": [\"*\"],
      \"ExposeHeaders\": [\"ETag\"],
      \"MaxAgeSeconds\": 3000
    }]
  }"

echo "==> Done. Current config:"
aws s3api get-bucket-cors --bucket "$BUCKET" --region "$REGION"
