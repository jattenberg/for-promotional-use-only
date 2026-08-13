#!/usr/bin/env python3
"""Add CloudFront /dashboard/* behavior with Basic Auth viewer-request function."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
STATE_DIR = SCRIPT_DIR / ".state"


def load_constants() -> dict[str, str]:
    """Parse constants.env into a key/value map."""
    values: dict[str, str] = {}
    for line in (SCRIPT_DIR / "constants.env").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        values[key] = value.strip().strip("'\"")
    return values


def aws_json(profile: str, *args: str) -> dict:
    """Run an aws CLI command and parse JSON stdout."""
    raw = subprocess.check_output(
        ["aws", *args, "--profile", profile, "--output", "json"],
        text=True,
    )
    return json.loads(raw)


def dashboard_behavior(origin_id: str, path_pattern: str, function_arn: str) -> dict:
    """Build a cache behavior for static dashboard HTML on the app S3 origin."""
    return {
        "PathPattern": path_pattern,
        "TargetOriginId": origin_id,
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
        "FunctionAssociations": {
            "Quantity": 1,
            "Items": [
                {
                    "FunctionARN": function_arn,
                    "EventType": "viewer-request",
                }
            ],
        },
        "FieldLevelEncryptionId": "",
        "GrpcConfig": {"Enabled": False},
        "ForwardedValues": {
            "QueryString": False,
            "Cookies": {"Forward": "none"},
            "Headers": {
                "Quantity": 1,
                "Items": ["Authorization"],
            },
            "QueryStringCacheKeys": {"Quantity": 0},
        },
        "MinTTL": 0,
        "DefaultTTL": 300,
        "MaxTTL": 86400,
    }


def main() -> int:
    """Fetch, patch, and apply the dashboard cache behavior + function association."""
    constants = load_constants()
    dist_id = constants["DISTRIBUTION_ID"]
    profile = constants["AWS_PROFILE"]
    origin_id = constants["APP_ORIGIN_ID"]
    path_pattern = constants.get("DASHBOARD_PATH_PATTERN", "dashboard/*")

    arn_file = STATE_DIR / "cloudfront-basic-auth-function-arn.txt"
    if not arn_file.exists():
        print(
            f"Missing {arn_file}; run bash infra/phase4/setup-dashboard-basic-auth.sh first.",
            file=sys.stderr,
        )
        return 1
    function_arn = arn_file.read_text().strip()
    if not function_arn:
        print("cloudfront-basic-auth-function-arn.txt is empty", file=sys.stderr)
        return 1

    payload = aws_json(profile, "cloudfront", "get-distribution-config", "--id", dist_id)
    etag = payload["ETag"]
    config = payload["DistributionConfig"]

    origin_ids = {item["Id"] for item in config["Origins"]["Items"]}
    if origin_id not in origin_ids:
        print(f"Origin {origin_id} not found on distribution {dist_id}", file=sys.stderr)
        return 1

    behaviors = list(config.get("CacheBehaviors", {}).get("Items") or [])
    behaviors = [item for item in behaviors if item.get("PathPattern") != path_pattern]
    behaviors = [dashboard_behavior(origin_id, path_pattern, function_arn), *behaviors]
    config["CacheBehaviors"] = {"Quantity": len(behaviors), "Items": behaviors}

    config["Comment"] = "for-promotional-use-only.com Phase 4 dashboard Basic Auth"

    config_path = Path("/tmp/promo-cf-dashboard-origin.json")
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

    print(f"Updated distribution {dist_id}: behavior {path_pattern} → {origin_id}")
    print(f"Viewer-request function: {function_arn}")
    print("Wait for Status=Deployed before verifying Basic Auth on /dashboard/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
