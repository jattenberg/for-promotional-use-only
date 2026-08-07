"""
Tests for promo_catalog.events_duckdb helpers.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from promo_catalog.events_duckdb import (
    DEFAULT_BUCKET,
    connect_events,
    events_parquet_glob,
    events_source_sql,
)


class TestEventsParquetGlob:
    """
    Tests for events_parquet_glob path construction.
    """

    def test_s3_default_all_days(self) -> None:
        """
        Build the default S3 glob for all partitions.
        """
        assert events_parquet_glob() == f"s3://{DEFAULT_BUCKET}/events/parquet/dt=*/**/*.parquet"

    def test_s3_single_day(self) -> None:
        """
        Pin a single hive partition day on S3.
        """
        assert (
            events_parquet_glob(bucket="b", day="2026-08-05")
            == "s3://b/events/parquet/dt=2026-08-05/**/*.parquet"
        )

    def test_local_dir(self) -> None:
        """
        Prefer a local parquet tree when local_dir is set.
        """
        path = events_parquet_glob(local_dir="/tmp/parquet", day="2026-08-05")
        assert path == os.path.join("/tmp/parquet", "dt=2026-08-05", "**", "*.parquet")


class TestEventsSourceSql:
    """
    Tests for events_source_sql escaping.
    """

    def test_escapes_single_quotes(self) -> None:
        """
        Escape single quotes inside the glob path for SQL literals.
        """
        sql = events_source_sql("s3://bucket/o's/**/*.parquet")
        assert "o''s" in sql
        assert "hive_partitioning=true" in sql


class TestConnectEventsLocal:
    """
    Tests for connect_events against a local Parquet tree.
    """

    def test_reads_local_partition(self, tmp_path: Path) -> None:
        """
        Create a tiny Parquet partition and query the events view.
        """
        pytest.importorskip("duckdb")
        import duckdb

        day_dir = tmp_path / "dt=2026-08-05"
        day_dir.mkdir()
        part = day_dir / "part-000.parquet"
        writer = duckdb.connect()
        writer.execute(
            """
            copy (
              select
                '2026-08-05T00:00:00Z' as ts,
                '2026-08-05T00:00:01Z' as received_at,
                'page_view' as event,
                '11111111-1111-4111-8111-111111111111' as session_id,
                '/k' as path,
                '{"song_path":null}' as props_json
            ) to ? (format parquet)
            """,
            [str(part)],
        )
        writer.close()

        con = connect_events(day="2026-08-05", local_dir=str(tmp_path))
        rows = con.execute(
            "select event, path, count(*)::bigint as n from events group by 1, 2"
        ).fetchall()
        assert rows == [("page_view", "/k", 1)]
        # hive partition column should be present
        dts = con.execute("select distinct cast(dt as varchar) from events").fetchall()
        assert dts == [("2026-08-05",)]
