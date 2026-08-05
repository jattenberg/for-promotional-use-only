#!/usr/bin/env bash
set -euo pipefail

# Sync the local Python env only. Catalog JSON generation lists live S3 and
# requires AWS credentials — run explicitly when needed:
#   uv run python -m promo_catalog.generate_json
uv sync
