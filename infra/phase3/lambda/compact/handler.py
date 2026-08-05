"""
Compact Lambda: convert prior-day NDJSON batches into a single Parquet file.
"""

from __future__ import annotations

import io
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import boto3
import pyarrow as pa
import pyarrow.parquet as pq

_s3 = None

SCHEMA = pa.schema(
    [
        ("ts", pa.string()),
        ("received_at", pa.string()),
        ("event", pa.string()),
        ("session_id", pa.string()),
        ("path", pa.string()),
        ("props_json", pa.string()),
    ]
)


def _s3_client():
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3


def target_day(event: dict[str, Any] | None = None) -> str:
    """
    Resolve the partition day to compact (UTC yesterday unless overridden).

    Args:
        event (dict[str, Any] | None, default: None): Optional {"day": "YYYY-MM-DD"}.

    Returns:
        str: Partition date string.
    """
    if event and isinstance(event.get("day"), str) and event["day"]:
        return event["day"]
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    return yesterday.isoformat()


def list_raw_keys(bucket: str, day: str) -> list[str]:
    """
    List raw NDJSON object keys for a day partition.

    Args:
        bucket (str): Events bucket.
        day (str): YYYY-MM-DD partition.

    Returns:
        list[str]: Object keys.
    """
    prefix = f"events/raw/dt={day}/"
    client = _s3_client()
    keys: list[str] = []
    token = None
    while True:
        kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        response = client.list_objects_v2(**kwargs)
        keys = keys + [
            item["Key"]
            for item in response.get("Contents") or []
            if item["Key"].endswith(".ndjson")
        ]
        if not response.get("IsTruncated"):
            return keys
        token = response.get("NextContinuationToken")


def load_events(bucket: str, keys: list[str]) -> list[dict[str, Any]]:
    """
    Download and parse NDJSON event objects.

    Args:
        bucket (str): Events bucket.
        keys (list[str]): S3 keys to read.

    Returns:
        list[dict[str, Any]]: Parsed event rows.
    """
    client = _s3_client()

    def parse_object(key: str) -> list[dict[str, Any]]:
        body = client.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
        return [json.loads(line) for line in body.splitlines() if line.strip()]

    return [row for key in keys for row in parse_object(key)]


def rows_to_table(events: list[dict[str, Any]]) -> pa.Table:
    """
    Convert event dicts to a PyArrow table matching SCHEMA.

    Args:
        events (list[dict[str, Any]]): Normalized event dicts.

    Returns:
        pa.Table: Typed table for Parquet write.
    """
    columns = {
        "ts": [str(event.get("ts") or "") for event in events],
        "received_at": [str(event.get("received_at") or "") for event in events],
        "event": [str(event.get("event") or "") for event in events],
        "session_id": [str(event.get("session_id") or "") for event in events],
        "path": [str(event.get("path") or "") for event in events],
        "props_json": [
            json.dumps(event.get("props") or {}, separators=(",", ":")) for event in events
        ],
    }
    return pa.Table.from_pydict(columns, schema=SCHEMA)


def write_parquet(bucket: str, day: str, table: pa.Table) -> str:
    """
    Write a Parquet object for the day partition.

    Args:
        bucket (str): Events bucket.
        day (str): YYYY-MM-DD partition.
        table (pa.Table): Events table.

    Returns:
        str: Written object key.
    """
    key = f"events/parquet/dt={day}/part-000.parquet"
    buffer = io.BytesIO()
    pq.write_table(table, buffer, compression="zstd")
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=buffer.getvalue(),
        ContentType="application/vnd.apache.parquet",
    )
    return key


def handler(event: dict[str, Any] | None, _context: Any) -> dict[str, Any]:
    """
    Compact prior-day raw NDJSON into Parquet.

    Args:
        event (dict[str, Any] | None): Optional {"day": "YYYY-MM-DD"} override.
        _context (Any): Unused Lambda context.

    Returns:
        dict[str, Any]: Summary of compaction.
    """
    bucket = os.environ.get("EVENTS_BUCKET", "")
    if not bucket:
        raise RuntimeError("EVENTS_BUCKET is required")

    day = target_day(event or {})
    keys = list_raw_keys(bucket, day)
    if not keys:
        return {"day": day, "raw_objects": 0, "rows": 0, "parquet_key": None}

    events = load_events(bucket, keys)
    table = rows_to_table(events)
    parquet_key = write_parquet(bucket, day, table)
    return {
        "day": day,
        "raw_objects": len(keys),
        "rows": table.num_rows,
        "parquet_key": parquet_key,
    }
