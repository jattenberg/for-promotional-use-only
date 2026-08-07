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
        from promo_catalog.events_duckdb import connect_events
    except ImportError:
        print(
            "promo_catalog is required: run from repo root via uv run",
            file=sys.stderr,
        )
        return 1

    day = args.day or "*"
    try:
        con = connect_events(
            bucket=args.bucket,
            day=day,
            local_dir=args.local_dir,
        )
    except ImportError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    result = con.execute(args.sql).fetchdf()
    print(result.to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
