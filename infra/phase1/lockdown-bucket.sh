#!/usr/bin/env bash
# Remove anonymous public read; keep OAC-only bucket policy (CloudFront is the only viewer path).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

STATE_DIR="${SCRIPT_DIR}/.state"
DIST_ID="$(cat "${STATE_DIR}/distribution-id.txt")"
DIST_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"

POLICY="$(mktemp)"
cat > "${POLICY}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "${DIST_ARN}"
        }
      }
    }
  ]
}
EOF

echo "==> Applying OAC-only bucket policy"
aws s3api put-bucket-policy \
  --bucket "${BUCKET}" \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --policy "file://${POLICY}"
rm -f "${POLICY}"

echo "Anonymous s3:GetObject removed. Site must be accessed via https://${DOMAIN} (CloudFront)."
echo "Rollback: rollback-dns.sh + restore-public-bucket.sh"
