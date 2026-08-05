#!/usr/bin/env bash
set -euo pipefail

uv sync
uv run python -m promo_catalog.generate_json
