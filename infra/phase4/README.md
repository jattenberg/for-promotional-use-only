# Phase 4 — nightly static events dashboard

Private `/dashboard/` HTML rendered from compacted event Parquet, published to the
app bucket, and gated at the CloudFront edge with HTTP Basic Auth.

## Architecture

1. `promo-events-compact` writes `events/parquet/dt=YYYY-MM-DD/part-000.parquet` when a day has traffic.
2. GitHub Actions (`.github/workflows/dashboard.yml`) runs daily at 09:00 UTC (and on demand).
3. The workflow skips unless yesterday's parquet exists **and** differs from the marker at
   `s3://for-promotional-use-only-events/dashboard-state/last-rendered-day.txt`.
4. `scripts/render_dashboard_static.py` queries DuckDB and writes `dist-dashboard/index.html`.
5. The workflow syncs only `dashboard/` on the app bucket and invalidates `/dashboard/*`.
6. SPA deploys (`scripts/deploy.sh`) exclude `dashboard/*` so `--delete` never removes it.

## One-time AWS setup

Requires Phase 2 (app bucket origin) and Phase 3 (event Parquet) to be live.

```bash
bash infra/phase4/setup-github-actions-dashboard-oidc.sh
bash infra/phase4/setup-dashboard-basic-auth.sh
python3 infra/phase4/update-cloudfront-dashboard-origin.py
# wait for CloudFront Status=Deployed
```

`setup-dashboard-basic-auth.sh` writes:

- `infra/phase4/.state/basic-auth-credentials.txt` — `user:pass` (gitignored)
- `infra/phase4/.state/cloudfront-basic-auth-function-arn.txt` — published function ARN

### CloudFront Functions API access

If `aws cloudfront list-functions --profile personal` returns `AccessDenied`, attach
`cloudfront:ListFunctions`, `cloudfront:CreateFunction`, `cloudfront:DescribeFunction`,
`cloudfront:UpdateFunction`, and `cloudfront:PublishFunction` to the deploy user before
running `setup-dashboard-basic-auth.sh`.

Distribution updates (`update-cloudfront-dashboard-origin.py`) additionally need
`cloudfront:GetDistribution`, `cloudfront:GetDistributionConfig`, and
`cloudfront:UpdateDistribution` (same as Phase 3).

## Credential rotation

1. Edit `infra/phase4/.state/basic-auth-credentials.txt` (`username:password` on one line).
2. Re-run `bash infra/phase4/setup-dashboard-basic-auth.sh` (re-publishes the function with the new Basic token).
3. Wait for the function publish to propagate (usually under a minute).
4. Verify:

```bash
curl -I "https://for-promotional-use-only.com/dashboard/"
# expect 401

source infra/phase4/.state/basic-auth-credentials.txt  # if stored as user:pass lines — or:
USER=...; PASS=...
curl -I -u "${USER}:${PASS}" "https://for-promotional-use-only.com/dashboard/"
# expect 200
```

CloudFront dry-run (optional):

```bash
aws cloudfront test-function \
  --name promo-dashboard-basic-auth \
  --if-match "$(aws cloudfront describe-function --name promo-dashboard-basic-auth --query ETag --output text --profile personal)" \
  --event-object file://infra/phase4/test-event-viewer-request.json \
  --profile personal
```

## Local render

```bash
uv sync --group dashboard
uv run --group dashboard python scripts/render_dashboard_static.py \
  --day 2026-08-05 \
  --output dist-dashboard/index.html
open dist-dashboard/index.html
```

For offline fixtures, pass `--local-dir /path/to/parquet/root`.

## Manual workflow run

Actions → **Nightly dashboard** → **Run workflow**. The same new-data gate applies; use this
after backfilling parquet or fixing a failed nightly run.

## Exit criteria

- `GET /dashboard/` without credentials → `401` + `WWW-Authenticate: Basic realm="Promo Dashboard"`
- `GET /dashboard/` with valid Basic Auth → `200` and self-contained Altair/Vega HTML
- Nightly workflow exits 0 without rendering when yesterday has no parquet
- Main SPA deploy does not delete `dashboard/` objects
