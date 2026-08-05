# Phase 1 — HTTPS edge (CloudFront + ACM + OAC)

Same-origin `https://for-promotional-use-only.com` for app and media. The ~243 GiB `mixtape/` corpus stays in the existing bucket; CloudFront fronts the S3 REST origin with OAC.

## Prerequisites

1. **ACM certificate** — already requested and **ISSUED** for apex + `www` (see `constants.env`).
2. **IAM** — the `personal` profile user needs CloudFront write actions (`required-iam-policy.json`). As of setup, `admin` could list distributions but not create OAC/distributions.
3. **Route53** — hosted zone `Z0744244TOTEYULCMHMW`.

## Run order

```bash
cd /path/to/for-promotional-use-only

# 1. CloudFront OAC + distribution + OAC bucket policy
bash infra/phase1/setup-cloudfront.sh

# Wait until distribution Status is Deployed:
aws cloudfront get-distribution --id "$(cat infra/phase1/.state/distribution-id.txt)" \
  --profile personal --query 'Distribution.Status' --output text

# 2. DNS cutover (apex + www → CloudFront)
bash infra/phase1/cutover-dns.sh

# 3. Flip MEDIA_BASE to https in src/songUtils.js, update tests, then deploy app + invalidate
bash infra/phase1/deploy-app.sh

# 4. Verify HTTPS SPA, Range audio, deep links
bash infra/phase1/verify.sh

# 5. Remove anonymous public read (after smoke passes)
bash infra/phase1/lockdown-bucket.sh
```

Use `PROMO_SMOKE_BASE=https://for-promotional-use-only.com` for smoke scripts after cutover.

## Rollback (DNS cutover)

If HTTPS cutover fails, re-point aliases to the S3 website endpoint:

```bash
bash infra/phase1/rollback-dns.sh
```

If the bucket was locked down:

```bash
bash infra/phase1/restore-public-bucket.sh
```

Pre-cutover DNS targeted `s3-website-us-east-1.amazonaws.com` (hosted zone `Z3AQBSTGFYJSTF`). Rollback restores that routing; cleartext `http://` works again with the public bucket policy.

CloudFront distribution and ACM cert can remain; they are harmless while DNS points at S3 website.

## State files

`infra/phase1/.state/` (gitignored) stores OAC id, distribution id, and cutover timestamp between scripts.

## Phase 1 exit criteria

- Users reach the site only over HTTPS
- `/k` returns **200** with SPA bundle (not bare 404)
- Audio Range **206** for keys with spaces/apostrophes
- `MEDIA_BASE` is `https://for-promotional-use-only.com/`
- Anonymous S3 REST/website object URLs do not work; CloudFront does
