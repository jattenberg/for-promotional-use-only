#!/usr/bin/env python3
"""Update CloudFront to dual-origin: app bucket default, /mixtape/* on media bucket."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def load_constants() -> dict[str, str]:
    """Parse constants.env into a key/value map."""
    values: dict[str, str] = {}
    for line in Path(SCRIPT_DIR / "constants.env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        values[key] = value
    return values


def forwarded_values_with_range() -> dict:
    """Legacy forwarded-values block that forwards Range for audio."""
    return {
        "QueryString": False,
        "Cookies": {"Forward": "none"},
        "Headers": {"Quantity": 1, "Items": ["Range"]},
        "QueryStringCacheKeys": {"Quantity": 0},
    }


def cache_behavior(
    path_pattern: str | None,
    target_origin_id: str,
    min_ttl: int,
    default_ttl: int,
    max_ttl: int,
) -> dict:
    """Build a cache behavior using legacy forwarded values."""
    behavior = {
        "TargetOriginId": target_origin_id,
        "TrustedSigners": {"Enabled": False, "Quantity": 0},
        "TrustedKeyGroups": {"Enabled": False, "Quantity": 0},
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 2,
            "Items": ["HEAD", "GET"],
            "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]},
        },
        "SmoothStreaming": False,
        "Compress": True,
        "LambdaFunctionAssociations": {"Quantity": 0},
        "FunctionAssociations": {"Quantity": 0},
        "FieldLevelEncryptionId": "",
        "GrpcConfig": {"Enabled": False},
        "ForwardedValues": forwarded_values_with_range(),
        "MinTTL": min_ttl,
        "DefaultTTL": default_ttl,
        "MaxTTL": max_ttl,
    }
    if path_pattern is not None:
        behavior["PathPattern"] = path_pattern
    return behavior


def main() -> int:
    """Fetch, patch, and apply the dual-origin distribution config."""
    constants = load_constants()
    dist_id = constants["DISTRIBUTION_ID"]
    profile = constants["AWS_PROFILE"]
    oac_id = constants["OAC_ID"]
    app_bucket = constants["APP_BUCKET"]
    media_bucket = constants["MEDIA_BUCKET"]
    region = constants["AWS_REGION"]
    app_origin_id = constants["APP_ORIGIN_ID"]
    media_origin_id = constants["MEDIA_ORIGIN_ID"]

    raw = subprocess.check_output(
        [
            "aws",
            "cloudfront",
            "get-distribution-config",
            "--id",
            dist_id,
            "--profile",
            profile,
            "--output",
            "json",
        ],
        text=True,
    )
    payload = json.loads(raw)
    etag = payload["ETag"]
    config = payload["DistributionConfig"]

    origin_template = {
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
        "S3OriginConfig": {"OriginAccessIdentity": ""},
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {"Enabled": False},
        "OriginAccessControlId": oac_id,
    }

    config["Origins"] = {
        "Quantity": 2,
        "Items": [
            {
                **origin_template,
                "Id": app_origin_id,
                "DomainName": f"{app_bucket}.s3.{region}.amazonaws.com",
            },
            {
                **origin_template,
                "Id": media_origin_id,
                "DomainName": f"{media_bucket}.s3.{region}.amazonaws.com",
            },
        ],
    }

    config["DefaultCacheBehavior"] = cache_behavior(
        None,
        app_origin_id,
        min_ttl=0,
        default_ttl=86400,
        max_ttl=31536000,
    )

    config["CacheBehaviors"] = {
        "Quantity": 2,
        "Items": [
            cache_behavior("index.html", app_origin_id, min_ttl=0, default_ttl=0, max_ttl=0),
            cache_behavior("mixtape/*", media_origin_id, min_ttl=0, default_ttl=86400, max_ttl=31536000),
        ],
    }

    config["Comment"] = "for-promotional-use-only.com Phase 2 dual-origin"

    config_path = Path("/tmp/promo-cf-dual-origin.json")
    config_path.write_text(json.dumps(config))

    subprocess.run(
        [
            "aws",
            "cloudfront",
            "update-distribution",
            "--id",
            dist_id,
            "--if-match",
            etag,
            "--distribution-config",
            f"file://{config_path}",
            "--profile",
            profile,
        ],
        check=True,
    )

    print(f"Updated distribution {dist_id} to dual-origin (app default, mixtape/* media).")
    print("Wait for Status=Deployed before verifying.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
