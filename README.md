# For Promotional Use Only

Classic rave mixtapes from the 90s and beyond.

Vite + React 18 + react-router v6. Stylus compiles via Vite. Python catalog via `uv` and `promo_catalog`.

## Get started

Requires [Node](https://nodejs.org/) and [uv](https://docs.astral.sh/uv/).

```bash
npm ci
npm run dev
```

Open http://localhost:5173 — letter routes like `/k` and `/num` work with the dev server.

## Catalog JSON

```bash
bash build_python.sh
# or: uv run python -m promo_catalog.generate_json
```

Writes `public/json/` (copied into `dist/json/` on build).

## Build and test

```bash
npm run build   # output: dist/
npm test        # vitest
```

## Deploy

Production: CloudFront + app bucket. See `infra/phase1/README.md` and `infra/phase2/README.md`.

```bash
bash build_python.sh
bash scripts/deploy.sh
```

Never sync or delete against the media bucket root — `mixtape/` is ~243 GiB.

## Production smoke

```bash
python3 scripts/prod_smoke.py
node scripts/prod_ui_smoke.mjs
```

## Add media

```bash
aws s3 sync your-folder-with-songs s3://for-promotional-use-only.com/mixtape/ --profile personal
```
