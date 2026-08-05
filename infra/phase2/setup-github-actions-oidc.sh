#!/usr/bin/env bash
# One-time: GitHub Actions OIDC provider + deploy role (least privilege).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

AWS_PROFILE="${AWS_PROFILE:-personal}"
ROLE_NAME="github-actions-for-promotional-use-only-deploy"
OIDC_PROVIDER_URL="https://token.actions.githubusercontent.com"
OIDC_PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "==> Ensuring GitHub OIDC provider exists"
if ! aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "${OIDC_PROVIDER_ARN}" \
  --profile "${AWS_PROFILE}" >/dev/null 2>&1; then
  THUMBPRINT="$(openssl s_client -servername token.actions.githubusercontent.com \
    -showcerts -connect token.actions.githubusercontent.com:443 </dev/null 2>/dev/null \
    | openssl x509 -fingerprint -sha1 -noout \
    | cut -d= -f2 | tr -d ':')"
  aws iam create-open-id-connect-provider \
    --url "${OIDC_PROVIDER_URL}" \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list "${THUMBPRINT}" \
    --profile "${AWS_PROFILE}"
else
  echo "OIDC provider already exists: ${OIDC_PROVIDER_ARN}"
fi

TRUST_POLICY="$(sed "s/740625777523/${ACCOUNT_ID}/g" "${SCRIPT_DIR}/github-actions-oidc-trust.json")"

echo "==> Creating or updating IAM role ${ROLE_NAME}"
if aws iam get-role --role-name "${ROLE_NAME}" --profile "${AWS_PROFILE}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "${TRUST_POLICY}" \
    --profile "${AWS_PROFILE}"
else
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --description "GitHub Actions deploy for for-promotional-use-only (app bucket + CF invalidation)" \
    --profile "${AWS_PROFILE}"
fi

echo "==> Attaching deploy policy"
aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name PromoAppDeploy \
  --policy-document "file://${SCRIPT_DIR}/deploy-iam-policy.json" \
  --profile "${AWS_PROFILE}"

echo "Done. Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "Workflow uses this ARN in .github/workflows/ci.yml (deploy job)."
