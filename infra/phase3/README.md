# Phase 3 — product event logging

Same-origin `POST /events` → Lambda Function URL → S3 NDJSON → daily Parquet → DuckDB.

See `docs/superpowers/specs/2026-08-05-product-event-logging-design.md`.

## Prerequisites

- Phase 2 complete (dual-origin CloudFront).
- AWS profile with the actions in `required-iam-policy.json` (notably **`iam:PassRole`**
  and **`lambda:AddPermission`** on `promo-events-*`).
  Function URL AuthType `NONE` needs **two** resource-policy statements
  (`lambda:InvokeFunctionUrl` **and** `lambda:InvokeFunction`). `deploy-lambdas.sh`
  adds both; if you created the URL by hand and get 403, run:

```bash
aws lambda add-permission \
  --function-name promo-events-ingest \
  --statement-id FunctionURLAllowPublicInvoke \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE \
  --profile personal --region us-east-1

aws lambda add-permission \
  --function-name promo-events-ingest \
  --statement-id FunctionURLAllowPublicInvokeFunction \
  --action lambda:InvokeFunction \
  --principal "*" \
  --profile personal --region us-east-1
```

If `AddPermission` fails with AccessDenied, attach `lambda:AddPermission` to the
deploy user (see `required-iam-policy.json`), wait a minute for IAM, and retry.

## One-time setup

```bash
bash infra/phase3/setup-events-bucket.sh
bash infra/phase3/deploy-lambdas.sh
python3 infra/phase3/update-cloudfront-events-origin.py
# wait for CloudFront Deployed
```

`deploy-lambdas.sh` writes:

- `infra/phase3/.state/promo-events-key.txt` — shared secret for `X-Promo-Key`
- `infra/phase3/.state/function-url.txt` — ingest Function URL
- `infra/phase3/.state/function-url-domain.txt` — CloudFront origin hostname

## App build env

Local (gitignored `.env`):

```bash
VITE_PROMO_EVENTS_KEY=<contents of promo-events-key.txt>
VITE_PROMO_EVENTS_URL=/events
```

GitHub Actions: add repository secret `VITE_PROMO_EVENTS_KEY` (same value). Deploy job
passes it into `npm run build`.

Without the key, the SPA no-ops event tracking (dev-safe).

## Verify ingest

```bash
KEY=$(tr -d '[:space:]' < infra/phase3/.state/promo-events-key.txt)
curl -i -X POST "https://for-promotional-use-only.com/events" \
  -H "content-type: application/json" \
  -H "x-promo-key: ${KEY}" \
  -d '[{"ts":"2026-08-05T00:00:00.000Z","event":"page_view","session_id":"11111111-1111-4111-8111-111111111111","path":"/k","props":{}}]'
```

Expect `204`. Then:

```bash
aws s3 ls s3://for-promotional-use-only-events/events/raw/ --recursive --profile personal
```

## Compact / query

Manual compact for a day:

```bash
aws lambda invoke \
  --function-name promo-events-compact \
  --payload '{"day":"2026-08-05"}' \
  --cli-binary-format raw-in-base64-out \
  --profile personal --region us-east-1 \
  /tmp/compact-out.json && cat /tmp/compact-out.json
```

Query with DuckDB:

```bash
uv run --with duckdb python scripts/query_events.py \
  --day 2026-08-05 \
  --sql "select event, count(*) n from events group by 1 order by n desc"
```

## Exit criteria

- `POST https://for-promotional-use-only.com/events` with valid key → 204 + raw NDJSON in bucket
- Unauthorized → 401
- Daily schedule `promo-events-compact-daily` enabled
- SPA ships with `VITE_PROMO_EVENTS_KEY` on master deploy
