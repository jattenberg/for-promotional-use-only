#!/usr/bin/env bash
# Deploy ingest + compact Lambdas, Function URL, and daily EventBridge schedule.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=constants.env
source "${SCRIPT_DIR}/constants.env"

STATE_DIR="${SCRIPT_DIR}/.state"
mkdir -p "${STATE_DIR}"
BUILD_DIR="${SCRIPT_DIR}/.build"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

KEY_FILE="${STATE_DIR}/promo-events-key.txt"
if [[ -f "${KEY_FILE}" ]]; then
  PROMO_EVENTS_KEY="$(tr -d '[:space:]' < "${KEY_FILE}")"
else
  PROMO_EVENTS_KEY="$(openssl rand -hex 24)"
  printf '%s\n' "${PROMO_EVENTS_KEY}" > "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
  echo "==> Generated ingest key at ${KEY_FILE}"
  echo "    Set GitHub Actions secret VITE_PROMO_EVENTS_KEY to this value for production builds."
fi

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}"

ensure_role() {
  if aws iam get-role --role-name "${LAMBDA_ROLE_NAME}" --profile "${AWS_PROFILE}" >/dev/null 2>&1; then
    echo "IAM role ${LAMBDA_ROLE_NAME} exists"
  else
    echo "==> Creating IAM role ${LAMBDA_ROLE_NAME}"
    aws iam create-role \
      --role-name "${LAMBDA_ROLE_NAME}" \
      --assume-role-policy-document "file://${SCRIPT_DIR}/lambda-trust.json" \
      --profile "${AWS_PROFILE}" >/dev/null
    aws iam put-role-policy \
      --role-name "${LAMBDA_ROLE_NAME}" \
      --policy-name promo-events-inline \
      --policy-document "file://${SCRIPT_DIR}/iam-lambda-events.json" \
      --profile "${AWS_PROFILE}"
    echo "Waiting for IAM role propagation..."
    sleep 10
  fi
}

zip_ingest() {
  local out="${BUILD_DIR}/ingest.zip"
  (
    cd "${SCRIPT_DIR}/lambda/ingest"
    zip -q -r "${out}" handler.py
  )
  echo "${out}"
}

zip_compact() {
  local stage="${BUILD_DIR}/compact-pkg"
  local out="${BUILD_DIR}/compact.zip"
  rm -rf "${stage}"
  mkdir -p "${stage}"
  cp "${SCRIPT_DIR}/lambda/compact/handler.py" "${stage}/"
  # boto3 ships in the Lambda runtime — only vendor pyarrow.
  uv pip install \
    --target "${stage}" \
    --python-platform x86_64-manylinux2014 \
    --python-version 3.12 \
    --only-binary=:all: \
    -r "${SCRIPT_DIR}/lambda/compact/requirements.txt"
  # Drop non-runtime weight from the pyarrow wheel.
  find "${stage}" -type d \( -name 'tests' -o -name '__pycache__' -o -name '*.dist-info' \) -prune -exec rm -rf {} +
  (
    cd "${stage}"
    zip -q -r "${out}" .
  )
  echo "${out}"
}

upload_code_to_s3() {
  local zip_path="$1"
  local key="lambda-deploys/$(basename "${zip_path}")"
  aws s3 cp "${zip_path}" "s3://${EVENTS_BUCKET}/${key}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null
  echo "${key}"
}

upsert_function() {
  local name="$1"
  local zip_path="$2"
  local handler="$3"
  local timeout="$4"
  local memory="$5"

  local env_vars="Variables={EVENTS_BUCKET=${EVENTS_BUCKET}"
  if [[ "${name}" == "${INGEST_FUNCTION_NAME}" ]]; then
    env_vars+=",PROMO_EVENTS_KEY=${PROMO_EVENTS_KEY}"
  fi
  env_vars+="}"

  local zip_bytes
  zip_bytes="$(wc -c < "${zip_path}" | tr -d ' ')"
  local use_s3=0
  # Direct CreateFunction/UpdateFunctionCode zip upload max is 50 MiB.
  if (( zip_bytes > 45000000 )); then
    use_s3=1
  fi

  local s3_key=""
  if (( use_s3 )); then
    echo "==> Uploading $(basename "${zip_path}") to s3://${EVENTS_BUCKET} (${zip_bytes} bytes)"
    s3_key="$(upload_code_to_s3 "${zip_path}")"
  fi

  if aws lambda get-function --function-name "${name}" --profile "${AWS_PROFILE}" --region "${AWS_REGION}" >/dev/null 2>&1; then
    echo "==> Updating ${name}"
    if (( use_s3 )); then
      aws lambda update-function-code \
        --function-name "${name}" \
        --s3-bucket "${EVENTS_BUCKET}" \
        --s3-key "${s3_key}" \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" >/dev/null
    else
      aws lambda update-function-code \
        --function-name "${name}" \
        --zip-file "fileb://${zip_path}" \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" >/dev/null
    fi
    aws lambda wait function-updated --function-name "${name}" --profile "${AWS_PROFILE}" --region "${AWS_REGION}"
    aws lambda update-function-configuration \
      --function-name "${name}" \
      --runtime python3.12 \
      --handler "${handler}" \
      --timeout "${timeout}" \
      --memory-size "${memory}" \
      --environment "${env_vars}" \
      --profile "${AWS_PROFILE}" \
      --region "${AWS_REGION}" >/dev/null
    aws lambda wait function-updated --function-name "${name}" --profile "${AWS_PROFILE}" --region "${AWS_REGION}"
  else
    echo "==> Creating ${name}"
    if (( use_s3 )); then
      aws lambda create-function \
        --function-name "${name}" \
        --runtime python3.12 \
        --role "${ROLE_ARN}" \
        --handler "${handler}" \
        --timeout "${timeout}" \
        --memory-size "${memory}" \
        --code "S3Bucket=${EVENTS_BUCKET},S3Key=${s3_key}" \
        --environment "${env_vars}" \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" >/dev/null
    else
      aws lambda create-function \
        --function-name "${name}" \
        --runtime python3.12 \
        --role "${ROLE_ARN}" \
        --handler "${handler}" \
        --timeout "${timeout}" \
        --memory-size "${memory}" \
        --zip-file "fileb://${zip_path}" \
        --environment "${env_vars}" \
        --profile "${AWS_PROFILE}" \
        --region "${AWS_REGION}" >/dev/null
    fi
    aws lambda wait function-active --function-name "${name}" --profile "${AWS_PROFILE}" --region "${AWS_REGION}"
  fi
}

ensure_function_url() {
  local name="$1"
  if aws lambda get-function-url-config \
    --function-name "${name}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null 2>&1; then
    aws lambda get-function-url-config \
      --function-name "${name}" \
      --profile "${AWS_PROFILE}" \
      --region "${AWS_REGION}" \
      --query FunctionUrl --output text
    return
  fi
  echo "==> Creating Function URL for ${name}" >&2
  # Function URL CORS AllowMethods entries max length 6 — "OPTIONS" is rejected.
  # Same-origin CloudFront→Lambda does not need browser CORS on the Function URL.
  aws lambda create-function-url-config \
    --function-name "${name}" \
    --auth-type NONE \
    --cors 'AllowOrigins=["*"],AllowMethods=["POST"],AllowHeaders=["content-type","x-promo-key"],MaxAge=86400' \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --query FunctionUrl --output text
  # AuthType NONE requires BOTH InvokeFunctionUrl and InvokeFunction.
  aws lambda add-permission \
    --function-name "${name}" \
    --statement-id FunctionURLAllowPublicInvoke \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null
  aws lambda add-permission \
    --function-name "${name}" \
    --statement-id FunctionURLAllowPublicInvokeFunction \
    --action lambda:InvokeFunction \
    --principal "*" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null
}

ensure_schedule() {
  local rule="${COMPACT_SCHEDULE_NAME}"
  local fn_arn
  fn_arn="$(aws lambda get-function \
    --function-name "${COMPACT_FUNCTION_NAME}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" \
    --query 'Configuration.FunctionArn' --output text)"

  aws events put-rule \
    --name "${rule}" \
    --schedule-expression "${COMPACT_SCHEDULE_EXPRESSION}" \
    --state ENABLED \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null

  aws lambda add-permission \
    --function-name "${COMPACT_FUNCTION_NAME}" \
    --statement-id "${rule}-invoke" \
    --action lambda:InvokeFunction \
    --principal events.amazonaws.com \
    --source-arn "arn:aws:events:${AWS_REGION}:${ACCOUNT_ID}:rule/${rule}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null 2>&1 || true

  aws events put-targets \
    --rule "${rule}" \
    --targets "Id=1,Arn=${fn_arn}" \
    --profile "${AWS_PROFILE}" \
    --region "${AWS_REGION}" >/dev/null
}

ensure_role

INGEST_ZIP="$(zip_ingest)"
COMPACT_ZIP="$(zip_compact)"

upsert_function "${INGEST_FUNCTION_NAME}" "${INGEST_ZIP}" "handler.handler" 10 128
upsert_function "${COMPACT_FUNCTION_NAME}" "${COMPACT_ZIP}" "handler.handler" 120 512

FUNCTION_URL="$(ensure_function_url "${INGEST_FUNCTION_NAME}")"
# Strip https:// and trailing slash for CloudFront origin domain
ORIGIN_DOMAIN="$(printf '%s' "${FUNCTION_URL}" | sed -E 's#https://##; s#/$##')"
printf '%s\n' "${FUNCTION_URL}" > "${STATE_DIR}/function-url.txt"
printf '%s\n' "${ORIGIN_DOMAIN}" > "${STATE_DIR}/function-url-domain.txt"

ensure_schedule

echo
echo "Ingest Function URL: ${FUNCTION_URL}"
echo "CloudFront origin domain: ${ORIGIN_DOMAIN}"
echo "Ingest key file: ${KEY_FILE}"
echo
echo "Next: python3 infra/phase3/update-cloudfront-events-origin.py"
echo "      Add VITE_PROMO_EVENTS_KEY to local .env / GitHub Actions secrets"
echo "      npm run build && bash scripts/deploy.sh"
