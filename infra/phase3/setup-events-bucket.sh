#!/usr/bin/env bash
# Create the dedicated events bucket with lifecycle rules for raw + parquet.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

if aws s3api head-bucket --bucket "${EVENTS_BUCKET}" --profile "${AWS_PROFILE}" 2>/dev/null; then
  echo "Bucket s3://${EVENTS_BUCKET} already exists"
else
  echo "==> Creating s3://${EVENTS_BUCKET}"
  aws s3api create-bucket \
    --bucket "${EVENTS_BUCKET}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}"
fi

echo "==> Block public access"
aws s3api put-public-access-block \
  --bucket "${EVENTS_BUCKET}" \
  --profile "${AWS_PROFILE}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

echo "==> Lifecycle: expire raw after 90d, parquet after 730d"
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${EVENTS_BUCKET}" \
  --profile "${AWS_PROFILE}" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-raw-90d",
        "Status": "Enabled",
        "Filter": {"Prefix": "events/raw/"},
        "Expiration": {"Days": 90}
      },
      {
        "ID": "expire-parquet-730d",
        "Status": "Enabled",
        "Filter": {"Prefix": "events/parquet/"},
        "Expiration": {"Days": 730}
      }
    ]
  }'

echo "Next: bash infra/phase3/deploy-lambdas.sh"
