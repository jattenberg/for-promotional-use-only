# Phase 2 — app bucket split

Split app artifacts into `for-promotional-use-only-app` (versioned) while `mixtape/` stays in `for-promotional-use-only.com`. CloudFront serves app paths from the app bucket and `/mixtape/*` from the media bucket.

## Prerequisites

- Phase 1 complete (HTTPS, OAC, distribution `E3N3G42L4RB0UV`).
- App bucket created with versioning (see `setup-app-bucket.sh`).

## One-time setup

```bash
bash infra/phase2/setup-app-bucket.sh      # create bucket + versioning + initial sync
bash infra/phase2/setup-app-bucket-policy.sh
python3 infra/phase2/update-cloudfront-dual-origin.py
# wait for Deployed
bash infra/phase2/clean-media-cruft.sh     # remove precache-manifest.* from media bucket root
```

## Deploy (safe --delete)

```bash
# Optional: regenerate catalog from S3 when mixtape changed
uv run python -m promo_catalog.generate_json

bash build_python.sh
npm run build
bash scripts/deploy.sh
```

`scripts/deploy.sh` syncs `dist/` to the **app bucket only** with `--delete`. Media is never in `dist/`, so `mixtape/` cannot be touched.

## IAM

Least-privilege deploy policy: `infra/phase2/deploy-iam-policy.json` (app bucket write + CF invalidation only).

## Exit criteria

- `aws s3 sync dist/ s3://for-promotional-use-only-app/ --delete` does not affect media.
- Site still loads over HTTPS; Range audio on `/mixtape/*` works.
- `python3 scripts/prod_smoke.py` — ALL_PASS.
