#!/usr/bin/env bash
# Remove SPA precache manifests from the media bucket root (no longer served after app split).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

echo "==> Listing precache-manifest.* on s3://${MEDIA_BUCKET}/"
KEYS="$(aws s3api list-objects-v2 \
  --bucket "${MEDIA_BUCKET}" \
  --prefix "precache-manifest." \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --query 'Contents[].Key' \
  --output text)"

if [[ -z "${KEYS}" || "${KEYS}" == "None" ]]; then
  echo "No precache-manifest.* objects found."
  exit 0
fi

for key in ${KEYS}; do
  echo "  deleting ${key}"
  aws s3api delete-object \
    --bucket "${MEDIA_BUCKET}" \
    --key "${key}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}"
done

echo "Done."
