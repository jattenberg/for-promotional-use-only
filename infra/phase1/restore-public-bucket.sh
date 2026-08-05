#!/usr/bin/env bash
# Restore the legacy public-read bucket policy (rollback companion to lockdown-bucket.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

echo "==> Restoring public-read bucket policy"
aws s3api put-bucket-policy \
  --bucket "${BUCKET}" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --policy "file://${SCRIPT_DIR}/bucket-policy-public-backup.json"

echo "Public read restored. S3 website endpoint works again after DNS rollback."
