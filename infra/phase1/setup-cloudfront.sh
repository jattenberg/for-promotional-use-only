#!/usr/bin/env bash
# Create CloudFront OAC + distribution for the existing media bucket (Phase 1).
# Requires CloudFront write IAM (see required-iam-policy.json). ACM cert must be ISSUED.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

STATE_DIR="${SCRIPT_DIR}/.state"
mkdir -p "${STATE_DIR}"

aws_cli() {
  aws --profile "${AWS_PROFILE}" --region "${AWS_REGION}" "$@"
}

echo "==> Checking ACM certificate"
CERT_STATUS="$(aws_cli acm describe-certificate \
  --certificate-arn "${CERT_ARN}" \
  --query 'Certificate.Status' \
  --output text)"
if [[ "${CERT_STATUS}" != "ISSUED" ]]; then
  echo "Certificate not ISSUED (status=${CERT_STATUS}). Wait for DNS validation." >&2
  exit 1
fi

if [[ -f "${STATE_DIR}/oac-id.txt" ]]; then
  OAC_ID="$(cat "${STATE_DIR}/oac-id.txt")"
  echo "==> Reusing OAC id ${OAC_ID}"
else
  echo "==> Creating Origin Access Control"
  OAC_ID="$(aws_cli cloudfront create-origin-access-control \
    --origin-access-control-config "Name=${OAC_NAME},Description=OAC for ${DOMAIN} S3 origin,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' \
    --output text)"
  echo "${OAC_ID}" > "${STATE_DIR}/oac-id.txt"
  echo "    OAC id: ${OAC_ID}"
fi

if [[ -f "${STATE_DIR}/distribution-id.txt" ]]; then
  DIST_ID="$(cat "${STATE_DIR}/distribution-id.txt")"
  echo "==> Reusing distribution ${DIST_ID}"
  DIST_DOMAIN="$(aws_cli cloudfront get-distribution \
    --id "${DIST_ID}" \
    --query 'Distribution.DomainName' \
    --output text)"
else
  ORIGIN_ID="${BUCKET}-s3"
  ORIGIN_DOMAIN="${BUCKET}.s3.${AWS_REGION}.amazonaws.com"
  CALLER_REF="promo-phase1-$(date +%Y%m%d%H%M%S)"

  DIST_CONFIG="$(mktemp)"
  cat > "${DIST_CONFIG}" <<EOF
{
  "CallerReference": "${CALLER_REF}",
  "Aliases": {
    "Quantity": 2,
    "Items": ["${DOMAIN}", "www.${DOMAIN}"]
  },
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "${ORIGIN_ID}",
        "DomainName": "${ORIGIN_DOMAIN}",
        "OriginAccessControlId": "${OAC_ID}",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "${ORIGIN_ID}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": { "Forward": "none" },
      "Headers": {
        "Quantity": 1,
        "Items": ["Range"]
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [
      {
        "PathPattern": "index.html",
        "TargetOriginId": "${ORIGIN_ID}",
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
          "Quantity": 2,
          "Items": ["GET", "HEAD"],
          "CachedMethods": {
            "Quantity": 2,
            "Items": ["GET", "HEAD"]
          }
        },
        "Compress": true,
        "ForwardedValues": {
          "QueryString": false,
          "Cookies": { "Forward": "none" },
          "Headers": {
            "Quantity": 1,
            "Items": ["Range"]
          }
        },
        "MinTTL": 0,
        "DefaultTTL": 0,
        "MaxTTL": 0
      }
    ]
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 10
      },
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 10
      }
    ]
  },
  "Comment": "${CF_COMMENT}",
  "Enabled": true,
  "ViewerCertificate": {
    "ACMCertificateArn": "${CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "HttpVersion": "http2and3",
  "PriceClass": "PriceClass_100"
}
EOF

  echo "==> Creating CloudFront distribution (may take a few minutes to deploy)"
  CREATE_OUT="$(aws_cli cloudfront create-distribution \
    --distribution-config "file://${DIST_CONFIG}")"
  rm -f "${DIST_CONFIG}"

  DIST_ID="$(echo "${CREATE_OUT}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Distribution"]["Id"])')"
  DIST_DOMAIN="$(echo "${CREATE_OUT}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Distribution"]["DomainName"])')"
  echo "${DIST_ID}" > "${STATE_DIR}/distribution-id.txt"
  echo "${DIST_DOMAIN}" > "${STATE_DIR}/distribution-domain.txt"
fi

DIST_ARN="arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"

echo "==> Applying OAC bucket policy on s3://${BUCKET}"
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
aws_cli s3api put-bucket-policy --bucket "${BUCKET}" --policy "file://${POLICY}"
rm -f "${POLICY}"

echo ""
echo "CloudFront ready:"
echo "  Distribution id: ${DIST_ID}"
echo "  Domain name:     ${DIST_DOMAIN}"
echo "  Distribution ARN: ${DIST_ARN}"
echo ""
echo "Next: bash infra/phase1/cutover-dns.sh"
echo "      (wait until distribution Status is Deployed before cutover)"
