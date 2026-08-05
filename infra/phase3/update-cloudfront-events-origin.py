#!/usr/bin/env python3
"""Add CloudFront custom origin + /events* behavior for the ingest Function URL."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
STATE_DIR = SCRIPT_DIR / ".state"

# AWS managed policies (unused — this distro uses legacy ForwardedValues)
CACHING_DISABLED = "4135ea2dd53ad250adac62b41314cec6"
ALL_VIEWER_EXCEPT_HOST = "b689b0a8-53d0-40ab-baf2-68738e2966ac"


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


def events_origin(origin_id: str, domain_name: str) -> dict:
    """Build a HTTPS custom origin pointing at the Lambda Function URL host."""
    return {
        "Id": origin_id,
        "DomainName": domain_name,
        "OriginPath": "",
        "CustomHeaders": {"Quantity": 0},
        "CustomOriginConfig": {
            "HTTPPort": 80,
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "https-only",
            "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
            "OriginReadTimeout": 30,
            "OriginKeepaliveTimeout": 5,
        },
        "ConnectionAttempts": 3,
        "ConnectionTimeout": 10,
        "OriginShield": {"Enabled": False},
        "OriginAccessControlId": "",
    }


def events_behavior(origin_id: str, path_pattern: str) -> dict:
    """Build an uncached POST-capable behavior for /events* (legacy cache config)."""
    return {
        "PathPattern": path_pattern,
        "TargetOriginId": origin_id,
        "TrustedSigners": {"Enabled": False, "Quantity": 0},
        "TrustedKeyGroups": {"Enabled": False, "Quantity": 0},
        "ViewerProtocolPolicy": "redirect-to-https",
        "AllowedMethods": {
            "Quantity": 7,
            "Items": ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"],
            "CachedMethods": {"Quantity": 2, "Items": ["HEAD", "GET"]},
        },
        "SmoothStreaming": False,
        "Compress": True,
        "LambdaFunctionAssociations": {"Quantity": 0},
        "FunctionAssociations": {"Quantity": 0},
        "FieldLevelEncryptionId": "",
        "GrpcConfig": {"Enabled": False},
        "ForwardedValues": {
            "QueryString": False,
            "Cookies": {"Forward": "none"},
            "Headers": {
                "Quantity": 2,
                "Items": ["x-promo-key", "Content-Type"],
            },
            "QueryStringCacheKeys": {"Quantity": 0},
        },
        "MinTTL": 0,
        "DefaultTTL": 0,
        "MaxTTL": 0,
    }


def main() -> int:
    """Fetch, patch, and apply the events origin + cache behavior."""
    constants = load_constants()
    dist_id = constants["DISTRIBUTION_ID"]
    profile = constants["AWS_PROFILE"]
    origin_id = constants["EVENTS_ORIGIN_ID"]
    path_pattern = constants.get("EVENTS_PATH_PATTERN", "events*")

    domain_file = STATE_DIR / "function-url-domain.txt"
    if not domain_file.exists():
        print(
            f"Missing {domain_file}; run bash infra/phase3/deploy-lambdas.sh first.",
            file=sys.stderr,
        )
        return 1
    origin_domain = domain_file.read_text().strip()
    if not origin_domain:
        print("function-url-domain.txt is empty", file=sys.stderr)
        return 1

    payload = aws_json(profile, "cloudfront", "get-distribution-config", "--id", dist_id)
    etag = payload["ETag"]
    config = payload["DistributionConfig"]

    origins = list(config["Origins"]["Items"])
    origins = [item for item in origins if item["Id"] != origin_id] + [
        events_origin(origin_id, origin_domain)
    ]
    config["Origins"] = {"Quantity": len(origins), "Items": origins}

    behaviors = list(config.get("CacheBehaviors", {}).get("Items") or [])
    behaviors = [item for item in behaviors if item.get("PathPattern") != path_pattern]
    behaviors = [events_behavior(origin_id, path_pattern), *behaviors]
    config["CacheBehaviors"] = {"Quantity": len(behaviors), "Items": behaviors}

    config["Comment"] = "for-promotional-use-only.com Phase 3 events + dual-origin"

    config_path = Path("/tmp/promo-cf-events-origin.json")
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

    print(f"Updated distribution {dist_id}: origin {origin_id} → {origin_domain}")
    print(f"Behavior path pattern: {path_pattern}")
    print("Wait for Status=Deployed before verifying POST /events.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
