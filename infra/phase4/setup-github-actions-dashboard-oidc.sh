#!/usr/bin/env bash
# One-time: GitHub Actions OIDC role for nightly dashboard deploy (narrow scope).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

AWS_PROFILE="${AWS_PROFILE:-personal}"
TRUST_POLICY="$(sed "s/740625777523/${ACCOUNT_ID}/g" "${SCRIPT_DIR}/../phase2/github-actions-oidc-trust.json")"

echo "==> Creating or updating IAM role ${GITHUB_DASHBOARD_ROLE_NAME}"
if aws iam get-role --role-name "${GITHUB_DASHBOARD_ROLE_NAME}" --profile "${AWS_PROFILE}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "${GITHUB_DASHBOARD_ROLE_NAME}" \
    --policy-document "${TRUST_POLICY}" \
    --profile "${AWS_PROFILE}"
else
  aws iam create-role \
    --role-name "${GITHUB_DASHBOARD_ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --description "GitHub Actions nightly dashboard deploy for for-promotional-use-only" \
    --profile "${AWS_PROFILE}"
fi

echo "==> Attaching dashboard deploy policy"
aws iam put-role-policy \
  --role-name "${GITHUB_DASHBOARD_ROLE_NAME}" \
  --policy-name PromoDashboardDeploy \
  --policy-document "file://${SCRIPT_DIR}/dashboard-deploy-iam-policy.json" \
  --profile "${AWS_PROFILE}"

echo "Done. Role ARN: arn:aws:iam::${ACCOUNT_ID}:role/${GITHUB_DASHBOARD_ROLE_NAME}"
echo "Workflow uses this ARN in .github/workflows/dashboard.yml."
