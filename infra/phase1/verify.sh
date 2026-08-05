#!/usr/bin/env bash
# Post-cutover verification: HTTPS SPA deep links, Range media, anonymous S3 blocked.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

BASE="https://${DOMAIN}"

echo "==> HTTP smoke (${BASE})"
PROMO_SMOKE_BASE="${BASE}" python3 "${REPO_ROOT}/scripts/prod_smoke.py"

echo ""
echo "==> Deep link status /k (expect 200)"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "${BASE}/k"

echo ""
echo "==> Anonymous S3 REST URL (expect 403 after lockdown)"
SAMPLE_KEY="mixtape/"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  "https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com/${SAMPLE_KEY}" || true

echo ""
echo "Manual: open ${BASE}/k and confirm bottom bar plays a track."
