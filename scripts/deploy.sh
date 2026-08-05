#!/usr/bin/env bash
# Build and sync app artifacts to the app bucket (--delete safe). Invalidate CloudFront.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

AWS_PROFILE="${AWS_PROFILE-personal}"
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_BUCKET="${APP_BUCKET:-for-promotional-use-only-app}"
DISTRIBUTION_ID="${DISTRIBUTION_ID:-E3N3G42L4RB0UV}"

PROFILE_ARGS=()
if [[ -n "${AWS_PROFILE}" ]]; then
  PROFILE_ARGS=(--profile "${AWS_PROFILE}")
fi

cd "${REPO_ROOT}"

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "==> Building app"
  npm run build
fi

echo "==> Syncing to s3://${APP_BUCKET}/ (--delete; mixtape/ never in build/)"
aws s3 sync dist/ "s3://${APP_BUCKET}/" \
  "${PROFILE_ARGS[@]}" \
  --region "${AWS_REGION}" \
  --delete

echo "==> Invalidating CloudFront /index.html, /assets/*, and /static/*"
INVALIDATION_ID="$(aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  "${PROFILE_ARGS[@]}" \
  --paths "/index.html" "/assets/*" "/static/*" \
  --query 'Invalidation.Id' \
  --output text)"

echo "Invalidation ${INVALIDATION_ID} submitted."
