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
Generate the catalog **before** building (CRA copies `public/json/` into `build/`):
```
bash build_python.sh
for-promotional-use-only-virtualenv/bin/python -m for-promotional-use-only.generate_json
npm run build
aws s3 cp build/ s3://for-promotional-use-only.com/ --recursive --profile personal
```

Never use `aws s3 sync --delete` against the bucket root — `mixtape/` holds ~243 GiB of media with versioning off.

### adding new songs:
`aws s3 sync your-folder-with-songs s3://for-promotional-use-only.com/mixtape/ --profile personal`

### rebuilding json files:
```
bash build_python.sh
for-promotional-use-only-virtualenv/bin/python -m for-promotional-use-only.generate_json
```
This writes letter lists and `index.json` under `public/json/`. Then `npm run build` copies them into `build/json/` for deploy.

`Dockerfile.dev` exists for local Docker development only.
