#!/usr/bin/env bash
# One-time: publish CloudFront Basic Auth function for /dashboard/*.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${SCRIPT_DIR}/.state"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

AWS_PROFILE="${AWS_PROFILE:-personal}"
CREDS_FILE="${STATE_DIR}/basic-auth-credentials.txt"
PUBLISHED_JS="${STATE_DIR}/cloudfront-basic-auth-function-published.js"
ARN_FILE="${STATE_DIR}/cloudfront-basic-auth-function-arn.txt"

mkdir -p "${STATE_DIR}"

if [[ ! -f "${CREDS_FILE}" ]]; then
  USER="promo-dashboard"
  PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 24)"
  printf '%s:%s\n' "${USER}" "${PASS}" > "${CREDS_FILE}"
  chmod 600 "${CREDS_FILE}"
  echo "Generated credentials in ${CREDS_FILE}"
else
  echo "Using existing credentials from ${CREDS_FILE}"
fi

IFS=: read -r BASIC_USER BASIC_PASS < "${CREDS_FILE}" || true
if [[ -z "${BASIC_PASS:-}" ]]; then
  BASIC_USER="$(cut -d: -f1 "${CREDS_FILE}")"
  BASIC_PASS="$(cut -d: -f2- "${CREDS_FILE}")"
fi
BASIC_TOKEN="$(printf '%s:%s' "${BASIC_USER}" "${BASIC_PASS}" | openssl base64 -A)"
sed "s#__BASIC_AUTH_VALUE__#Basic ${BASIC_TOKEN}#" \
  "${SCRIPT_DIR}/cloudfront-basic-auth-function.js" > "${PUBLISHED_JS}"

echo "==> Checking CloudFront Functions API access"
if ! aws cloudfront list-functions --profile "${AWS_PROFILE}" >/dev/null 2>&1; then
  echo "AccessDenied on cloudfront:ListFunctions." >&2
  echo "Grant cloudfront:ListFunctions, cloudfront:CreateFunction, cloudfront:DescribeFunction," >&2
  echo "cloudfront:UpdateFunction, and cloudfront:PublishFunction to the deploy user, then retry." >&2
  exit 1
fi

echo "==> Creating or updating function ${DASHBOARD_FUNCTION_NAME}"
if aws cloudfront describe-function \
  --name "${DASHBOARD_FUNCTION_NAME}" \
  --profile "${AWS_PROFILE}" >/dev/null 2>&1; then
  ETAG="$(aws cloudfront describe-function \
    --name "${DASHBOARD_FUNCTION_NAME}" \
    --profile "${AWS_PROFILE}" \
    --query 'ETag' \
    --output text)"
  aws cloudfront update-function \
    --name "${DASHBOARD_FUNCTION_NAME}" \
    --if-match "${ETAG}" \
    --function-config "Comment=Promo dashboard Basic Auth,Runtime=cloudfront-js-2.0" \
    --function-code "fileb://${PUBLISHED_JS}" \
    --profile "${AWS_PROFILE}" >/dev/null
  ETAG="$(aws cloudfront describe-function \
    --name "${DASHBOARD_FUNCTION_NAME}" \
    --profile "${AWS_PROFILE}" \
    --query 'ETag' \
    --output text)"
else
  aws cloudfront create-function \
    --name "${DASHBOARD_FUNCTION_NAME}" \
    --function-config "Comment=Promo dashboard Basic Auth,Runtime=cloudfront-js-2.0" \
    --function-code "fileb://${PUBLISHED_JS}" \
    --profile "${AWS_PROFILE}" >/dev/null
  ETAG="$(aws cloudfront describe-function \
    --name "${DASHBOARD_FUNCTION_NAME}" \
    --profile "${AWS_PROFILE}" \
    --query 'ETag' \
    --output text)"
fi

echo "==> Publishing function"
FUNCTION_ARN="$(aws cloudfront publish-function \
  --name "${DASHBOARD_FUNCTION_NAME}" \
  --if-match "${ETAG}" \
  --profile "${AWS_PROFILE}" \
  --query 'FunctionSummary.FunctionMetadata.FunctionARN' \
  --output text)"
printf '%s\n' "${FUNCTION_ARN}" > "${ARN_FILE}"
echo "Published ${FUNCTION_ARN}"
echo "Credentials: ${CREDS_FILE}"
echo "Next: python3 infra/phase4/update-cloudfront-dashboard-origin.py"
