#!/usr/bin/env bash
# Create app bucket (versioned) and copy current app artifacts from the media bucket.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

if aws s3api head-bucket --bucket "${APP_BUCKET}" --profile "${AWS_PROFILE}" 2>/dev/null; then
  echo "Bucket s3://${APP_BUCKET} already exists"
else
  echo "==> Creating s3://${APP_BUCKET}"
  aws s3api create-bucket \
    --bucket "${APP_BUCKET}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}"
fi

echo "==> Enabling versioning"
aws s3api put-bucket-versioning \
  --bucket "${APP_BUCKET}" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --versioning-configuration Status=Enabled

echo "==> Copying app artifacts from media bucket (excluding mixtape/)"
aws s3 sync "s3://${MEDIA_BUCKET}/" "s3://${APP_BUCKET}/" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --exclude "mixtape/*"

echo "Next: bash infra/phase2/setup-app-bucket-policy.sh"
echo "      python3 infra/phase2/update-cloudfront-dual-origin.py"
