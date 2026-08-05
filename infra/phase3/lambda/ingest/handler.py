"""
Ingest Lambda: accept batched product events and write NDJSON to S3.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3

ALLOWED_EVENTS = frozenset(
    {
        "page_view",
        "play_started",
        "play_completed",
        "search",
        "favorite_add",
        "favorite_remove",
    }
)
MAX_EVENTS = 50
MAX_BODY_BYTES = 32 * 1024
MAX_PROP_KEYS = 20
MAX_STRING_LEN = 512
SESSION_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

_s3 = None


def _s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3


def _response(status: int, body: str = "") -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": body,
    }


def _header(headers: dict[str, str], name: str) -> str:
    lowered = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    return lowered.get(name.lower(), "")


def _truncate(value: str) -> str:
    if len(value) <= MAX_STRING_LEN:
        return value
    return value[:MAX_STRING_LEN]


def _sanitize_prop_value(value: Any) -> Any:
    if isinstance(value, str):
        return _truncate(value)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    return _truncate(json.dumps(value, default=str))


def _sanitize_props(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    keys = list(raw.keys())[:MAX_PROP_KEYS]
    return {str(key)[:64]: _sanitize_prop_value(raw[key]) for key in keys}


def normalize_event(raw: Any, received_at: str) -> dict[str, Any] | None:
    """
    Validate and normalize one client event into the storage envelope.

    Args:
        raw (Any): Parsed JSON object from the client batch.
        received_at (str): Server receive timestamp (ISO-8601).

    Returns:
        dict[str, Any] | None: Normalized event, or None if invalid.
    """
    if not isinstance(raw, dict):
        return None
    event_name = raw.get("event")
    if not isinstance(event_name, str) or event_name not in ALLOWED_EVENTS:
        return None
    session_id = raw.get("session_id")
    if not isinstance(session_id, str) or not SESSION_ID_RE.match(session_id):
        return None
    path = raw.get("path", "/")
    if not isinstance(path, str):
        return None
    ts = raw.get("ts")
    if not isinstance(ts, str) or not ts:
        ts = received_at
    return {
        "ts": _truncate(ts),
        "received_at": received_at,
        "event": event_name,
        "session_id": session_id.lower(),
        "path": _truncate(path),
        "props": _sanitize_props(raw.get("props")),
    }


def parse_batch(body: str) -> list[dict[str, Any]]:
    """
    Parse a POST body into a list of normalized events.

    Args:
        body (str): Raw HTTP body (JSON array or {"events": [...]}).

    Returns:
        list[dict[str, Any]]: Normalized events (may be empty).

    Raises:
        ValueError: If the body is not valid JSON or exceeds limits.
    """
    if len(body.encode("utf-8")) > MAX_BODY_BYTES:
        raise ValueError("body too large")
    payload = json.loads(body)
    if isinstance(payload, dict):
        items = payload.get("events")
    else:
        items = payload
    if not isinstance(items, list):
        raise ValueError("events must be a list")
    if len(items) > MAX_EVENTS:
        raise ValueError("too many events")
    received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return [
        event
        for event in (normalize_event(item, received_at) for item in items)
        if event is not None
    ]


def write_ndjson(bucket: str, events: list[dict[str, Any]], now: datetime | None = None) -> str:
    """
    Write a batch of events as one NDJSON object under events/raw/.

    Args:
        bucket (str): Destination bucket name.
        events (list[dict[str, Any]]): Normalized events.
        now (datetime | None, default: None): Override clock for tests.

    Returns:
        str: S3 object key written.
    """
    clock = now or datetime.now(timezone.utc)
    day = clock.strftime("%Y-%m-%d")
    key = f"events/raw/dt={day}/{uuid.uuid4()}.ndjson"
    body = "\n".join(json.dumps(event, separators=(",", ":")) for event in events) + "\n"
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType="application/x-ndjson",
    )
    return key


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    """
    Lambda Function URL entrypoint for product event ingest.

    Args:
        event (dict[str, Any]): Function URL / API Gateway-style request.
        _context (Any): Unused Lambda context.

    Returns:
        dict[str, Any]: HTTP response.
    """
    expected_key = os.environ.get("PROMO_EVENTS_KEY", "")
    bucket = os.environ.get("EVENTS_BUCKET", "")
    if not expected_key or not bucket:
        return _response(500, '{"error":"misconfigured"}')

    method = (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or ""
    ).upper()
    if method == "OPTIONS":
        return _response(204)
    if method != "POST":
        return _response(405, '{"error":"method not allowed"}')

    headers = event.get("headers") or {}
    if _header(headers, "x-promo-key") != expected_key:
        return _response(401, '{"error":"unauthorized"}')

    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        import base64

        body = base64.b64decode(body).decode("utf-8")

    try:
        events = parse_batch(body)
    except (ValueError, json.JSONDecodeError) as exc:
        return _response(400, json.dumps({"error": str(exc)}))

    if not events:
        return _response(204)

    write_ndjson(bucket, events)
    return _response(204)
