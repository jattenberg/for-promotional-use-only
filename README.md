# For Promotional Use Only
Classic rave mixtapes from the 90s and beyond

This project was bootstrapped with [Create React App](https://github.com/facebookincubator/create-react-app), Twitter Bootstrap (Lumen), Google Fonts

## Get Started
Critical: make sure the latest version of [Node](https://nodejs.org/en/) and [NPM](https://docs.npmjs.com/troubleshooting/try-the-latest-stable-version-of-npm) are installed.

No `.nvmrc` / Node 16 pin is required — `NODE_OPTIONS=--openssl-legacy-provider` is baked into the npm scripts, so plain `npm ci && npm start` works on modern Node.

### Running Locally:
```
npm ci
npm start
```

### Deploying

Production is served via **CloudFront + ACM** on `https://for-promotional-use-only.com` (Phase 1). See `infra/phase1/README.md` for cutover, rollback, and lockdown steps.

Generate the catalog **before** building (CRA copies `public/json/` into `build/`):
```
bash build_python.sh
for-promotional-use-only-virtualenv/bin/python -m for-promotional-use-only.generate_json
npm run build
```

After CloudFront is live, deploy **app objects only** (never `mixtape/`):

```bash
bash scripts/deploy.sh
```

Phase 1 cutover helper (syncs to media bucket — superseded after Phase 2 app split):

```
bash infra/phase1/deploy-app.sh
```

Legacy cleartext S3 website deploy (pre-cutover only):
```
aws s3 sync build/ s3://for-promotional-use-only.com/ --exclude "mixtape/*" --profile personal
```

Never use `aws s3 sync --delete` against the bucket root — `mixtape/` holds ~243 GiB of media with versioning off.

### Production smoke
```
python3 scripts/prod_smoke.py
PROMO_SMOKE_BASE=https://for-promotional-use-only.com node scripts/prod_ui_smoke.mjs
```

### adding new songs:
`aws s3 sync your-folder-with-songs s3://for-promotional-use-only.com/mixtape/ --profile personal`

### rebuilding json files:
```
bash build_python.sh
for-promotional-use-only-virtualenv/bin/python -m for-promotional-use-only.generate_json
```
This writes letter lists and `index.json` under `public/json/`. Then `npm run build` copies them into `build/json/` for deploy.

`Dockerfile.dev` exists for local Docker development only.
