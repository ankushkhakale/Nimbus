#!/usr/bin/env bash
# Point the S3 bucket's ObjectCreated events at the thumbnailer Lambda.
#
# Done here rather than in CloudFormation because the bucket was created
# before the stack existed, and CloudFormation can only attach a
# NotificationConfiguration to a bucket defined in the same template.
#
# Safe to re-run: put-bucket-notification-configuration replaces the whole
# configuration, so this is declarative rather than additive.
#
# Usage: scripts/configure_thumbnail_trigger.sh <bucket> [stack] [region]
set -euo pipefail

BUCKET="${1:?usage: configure_thumbnail_trigger.sh <bucket> [stack] [region]}"
STACK="${2:-nimbus-backend}"
REGION="${3:-ap-south-1}"

ARN=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`ThumbnailerArn`].OutputValue' --output text)

if [[ -z "$ARN" || "$ARN" == "None" ]]; then
  echo "Could not read ThumbnailerArn from stack $STACK" >&2
  exit 1
fi

echo "==> Wiring s3://$BUCKET (prefix users/) -> $ARN"

# The users/ prefix filter is load-bearing: thumbnails are written under
# thumbnails/, so without it every generated thumbnail would re-trigger
# this function and recurse until the bill says otherwise.
aws s3api put-bucket-notification-configuration \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --notification-configuration "{
    \"LambdaFunctionConfigurations\": [{
      \"Id\": \"nimbus-thumbnailer\",
      \"LambdaFunctionArn\": \"$ARN\",
      \"Events\": [\"s3:ObjectCreated:*\"],
      \"Filter\": {\"Key\": {\"FilterRules\": [{\"Name\": \"prefix\", \"Value\": \"users/\"}]}}
    }]
  }"

echo "==> Current configuration:"
aws s3api get-bucket-notification-configuration --bucket "$BUCKET" --region "$REGION"
