# For Promotional Use Only
Classic rave mixtapes from the 90s and beyond

This project was bootstrapped with [Create React App](https://github.com/facebookincubator/create-react-app), Twitter Bootstrap (Lumen), Google Fonts

## Get Started
Critical: make sure the latest version of [Node] (https://nodejs.org/en/) and [NPM](https://docs.npmjs.com/troubleshooting/try-the-latest-stable-version-of-npm) are installed.

### Running Locally:
`npm run build`
`aws s3 cp build/ s3://for-promotional-use-only.com/ --recursive`


### adding new songs:
`aws s3 sync your-folder-with-songs s3://for-promotional-use-only.com/mixtape/`

### rebuilding and publishing json files:
`bash build_python.sh`
`for-promotional-use-only-virtualenv/bin/python -m for-promotional-use-only.generate_json`
`aws s3 sync build/json s3://for-promotional-use-only.com/json`