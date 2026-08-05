#!/usr/bin/env bash
# Point apex + www A aliases from S3 website endpoint to CloudFront.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

STATE_DIR="${SCRIPT_DIR}/.state"
DIST_ID="$(cat "${STATE_DIR}/distribution-id.txt")"
DIST_DOMAIN="$(aws cloudfront get-distribution \
  --id "${DIST_ID}" \
  --profile "${AWS_PROFILE}" \
  --query 'Distribution.DomainName' \
  --output text)"
CF_HOSTED_ZONE_ID="Z2FDTNDATAQYW2"

echo "==> Cutting DNS to CloudFront ${DIST_DOMAIN} (distribution ${DIST_ID})"

CHANGE_BATCH="$(mktemp)"
cat > "${CHANGE_BATCH}" <<EOF
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN}",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "${CF_HOSTED_ZONE_ID}",
          "DNSName": "${DIST_DOMAIN}",
          "EvaluateTargetHealth": false
        }
      }
    },
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "www.${DOMAIN}",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "${CF_HOSTED_ZONE_ID}",
          "DNSName": "${DIST_DOMAIN}",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets \
  --hosted-zone-id "${HOSTED_ZONE_ID}" \
  --profile "${AWS_PROFILE}" \
  --change-batch "file://${CHANGE_BATCH}"
rm -f "${CHANGE_BATCH}"

echo "${DIST_DOMAIN}" > "${STATE_DIR}/cutover-cf-domain.txt"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "${STATE_DIR}/cutover-timestamp.txt"

echo "DNS cutover submitted. Allow a few minutes for propagation."
echo "Verify: PROMO_SMOKE_BASE=https://${DOMAIN} python3 scripts/prod_smoke.py"
echo "Rollback: bash infra/phase1/rollback-dns.sh"
