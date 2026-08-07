"""
DuckDB helpers for querying promo product-event Parquet.

Parquet schema (compact Lambda): ts, received_at, event, session_id, path,
props_json, plus hive partition column ``dt`` when hive_partitioning is on.
"""

from __future__ import annotations

import os

DEFAULT_BUCKET = "for-promotional-use-only-events"
DEFAULT_PROFILE = "personal"


def events_parquet_glob(
    *,
    bucket: str = DEFAULT_BUCKET,
    day: str = "*",
    local_dir: str | None = None,
) -> str:
    """
    Build a glob path for event Parquet files.

    Args:
        bucket (str, default: DEFAULT_BUCKET): S3 bucket name (ignored if local_dir).
        day (str, default: "*"): Partition day YYYY-MM-DD, or ``*`` for all.
        local_dir (str | None, default: None): Local parquet root with dt=.../ trees.

    Returns:
        str: Filesystem or s3:// glob suitable for read_parquet.
    """
    partition = f"dt={day}"
    if local_dir:
        return os.path.join(local_dir, partition, "**", "*.parquet")
    return f"s3://{bucket}/events/parquet/{partition}/**/*.parquet"


def events_source_sql(glob_path: str) -> str:
    """
    SQL expression that reads hive-partitioned event Parquet.

    Args:
        glob_path (str): Glob from events_parquet_glob.

    Returns:
        str: read_parquet(...) expression for CREATE VIEW.
    """
    escaped = glob_path.replace("'", "''")
    return f"read_parquet('{escaped}', hive_partitioning=true)"


def connect_events(
    *,
    bucket: str | None = None,
    day: str = "*",
    local_dir: str | None = None,
    profile: str | None = None,
):
    """
    Open an in-memory DuckDB connection with an ``events`` view over Parquet.

    Args:
        bucket (str | None, default: None): Events bucket; defaults to EVENTS_BUCKET
            env or DEFAULT_BUCKET.
        day (str, default: "*"): Partition day or ``*``.
        local_dir (str | None, default: None): Local parquet tree (skips S3).
        profile (str | None, default: None): AWS profile for httpfs credentials;
            defaults to AWS_PROFILE env or DEFAULT_PROFILE.

    Returns:
        duckdb.DuckDBPyConnection: Connection with view ``events``.

    Raises:
        ImportError: If duckdb is not installed.
    """
    try:
        import duckdb
    except ImportError as exc:
        raise ImportError(
            "duckdb is required: uv run --with duckdb … or uv sync --group dashboard"
        ) from exc

    resolved_bucket = bucket or os.environ.get("EVENTS_BUCKET", DEFAULT_BUCKET)
    glob_path = events_parquet_glob(
        bucket=resolved_bucket,
        day=day,
        local_dir=local_dir,
    )
    source = events_source_sql(glob_path)
    con = duckdb.connect()
    if not local_dir:
        resolved_profile = profile or os.environ.get("AWS_PROFILE", DEFAULT_PROFILE)
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute(f"CALL load_aws_credentials('{resolved_profile}');")
    con.execute(f"create or replace view events as select * from {source}")
    return con
