#!/usr/bin/env bash
# Build and upload app artifacts only (never touch mixtape/). Invalidate CloudFront.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

STATE_DIR="${SCRIPT_DIR}/.state"
DIST_ID="$(cat "${STATE_DIR}/distribution-id.txt")"

cd "${REPO_ROOT}"

echo "==> Building app"
npm run build

echo "==> Syncing app objects to s3://${BUCKET} (excluding mixtape/)"
aws s3 sync dist/ "s3://${BUCKET}/" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --exclude "mixtape/*"

echo "==> Creating CloudFront invalidation for /index.html, /assets/*, and /static/*"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "${DIST_ID}" \
  --profile "${AWS_PROFILE}" \
  --paths "/index.html" "/assets/*" "/static/*" \
  --query 'Invalidation.Id' \
  --output text)"

echo "Invalidation ${INVALIDATION_ID} submitted."
