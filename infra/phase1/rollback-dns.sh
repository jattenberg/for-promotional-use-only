#!/usr/bin/env bash
# Rollback apex + www A aliases to the S3 static website endpoint.
# Restores the pre-Phase-1 routing (cleartext S3 website hosting).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

echo "==> Rolling DNS back to S3 website (${S3_WEBSITE_DNS})"

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
          "HostedZoneId": "${S3_WEBSITE_HOSTED_ZONE_ID}",
          "DNSName": "${S3_WEBSITE_DNS}",
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
          "HostedZoneId": "${S3_WEBSITE_HOSTED_ZONE_ID}",
          "DNSName": "${S3_WEBSITE_DNS}",
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

echo "DNS rollback submitted."
echo "If bucket was locked down, also run: bash infra/phase1/restore-public-bucket.sh"
