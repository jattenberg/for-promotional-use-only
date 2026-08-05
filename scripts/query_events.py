#!/usr/bin/env python3
"""Query promo product events from S3 Parquet (or a local sync) via DuckDB."""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    """
    Run a DuckDB SQL query against partitioned event Parquet files.

    Returns:
        int: Process exit code.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bucket",
        default=os.environ.get("EVENTS_BUCKET", "for-promotional-use-only-events"),
        help="Events bucket name (ignored when --local-dir is set)",
    )
    parser.add_argument("--day", help="Partition day YYYY-MM-DD (optional glob via *)")
    parser.add_argument(
        "--local-dir",
        help="Local directory containing parquet/dt=.../ tree (skips S3)",
    )
    parser.add_argument(
        "--sql",
        default="select event, count(*) as n from events group by 1 order by n desc",
        help="SQL against view/table name `events`",
    )
    args = parser.parse_args()

    try:
        import duckdb
    except ImportError:
        print(
            "duckdb is required: uv run --with duckdb python scripts/query_events.py ...",
            file=sys.stderr,
        )
        return 1

    day = args.day or "*"
    if args.local_dir:
        glob_path = os.path.join(args.local_dir, f"dt={day}", "**", "*.parquet")
        source = f"read_parquet('{glob_path}', hive_partitioning=true)"
    else:
        glob_path = f"s3://{args.bucket}/events/parquet/dt={day}/**/*.parquet"
        source = f"read_parquet('{glob_path}', hive_partitioning=true)"

    con = duckdb.connect()
    if not args.local_dir:
        # Prefer credential chain (env / shared config / profile)
        profile = os.environ.get("AWS_PROFILE", "personal")
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute(f"CALL load_aws_credentials('{profile}');")

    con.execute(f"create or replace view events as select * from {source}")
    result = con.execute(args.sql).fetchdf()
    print(result.to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
