"""
Tests for scripts/render_dashboard_static.py.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

RENDER_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "render_dashboard_static.py"


def load_render_module():
    """Load render_dashboard_static.py as a module without packaging scripts/."""
    spec = importlib.util.spec_from_file_location("render_dashboard_static", RENDER_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


render_mod = load_render_module()


class TestRenderDashboardStatic:
    """
    Tests for the headless static dashboard renderer.
    """

    def test_renders_html_from_local_partition(self, tmp_path: Path) -> None:
        """
        Build HTML from a tiny local Parquet fixture and assert chart data is embedded.
        """
        pytest.importorskip("duckdb")
        import duckdb

        parquet_root = tmp_path / "parquet"
        day_dir = parquet_root / "dt=2026-08-05"
        day_dir.mkdir(parents=True)
        part = day_dir / "part-000.parquet"
        writer = duckdb.connect()
        writer.execute(
            """
            copy (
              select * from (
                select
                  '2026-08-05T00:00:00Z' as ts,
                  '2026-08-05T00:00:00Z' as received_at,
                  'page_view' as event,
                  '11111111-1111-4111-8111-111111111111' as session_id,
                  '/k' as path,
                  '{"song_path":null}' as props_json
                union all
                select
                  '2026-08-05T00:00:01Z',
                  '2026-08-05T00:00:01Z',
                  'play_started',
                  '11111111-1111-4111-8111-111111111111',
                  '/k',
                  '{"song_path":"mixtape/a.mp3"}'
                union all
                select
                  '2026-08-05T00:00:02Z',
                  '2026-08-05T00:00:02Z',
                  'play_completed',
                  '11111111-1111-4111-8111-111111111111',
                  '/k',
                  '{"song_path":"mixtape/a.mp3"}'
                union all
                select
                  '2026-08-05T00:00:03Z',
                  '2026-08-05T00:00:03Z',
                  'search',
                  '11111111-1111-4111-8111-111111111111',
                  '/k',
                  '{"query":"jungle"}'
              )
            ) to ? (format parquet)
            """,
            [str(part)],
        )
        writer.close()

        output = tmp_path / "index.html"
        data = render_mod.render_dashboard(
            bucket=None,
            day="2026-08-05",
            local_dir=str(parquet_root),
            profile=None,
            output_path=output,
        )

        assert output.exists()
        html = output.read_text(encoding="utf-8")
        assert data.row_count == 4
        assert "Promo product events" in html
        assert "page_view" in html
        assert "play_started" in html
        assert "mixtape/a.mp3" in html
        assert "jungle" in html
        assert "Play completion" in html
        assert "100%" in html or "100.0%" in html or ">100<" in html

    def test_build_charts_from_query_results(self, tmp_path: Path) -> None:
        """
        Smoke-test Altair chart construction from queried dashboard data.
        """
        pytest.importorskip("duckdb")
        import duckdb

        parquet_root = tmp_path / "parquet"
        day_dir = parquet_root / "dt=2026-08-05"
        day_dir.mkdir(parents=True)
        part = day_dir / "part-000.parquet"
        writer = duckdb.connect()
        writer.execute(
            """
            copy (
              select
                '2026-08-05T00:00:00Z' as ts,
                '2026-08-05T00:00:00Z' as received_at,
                'page_view' as event,
                '11111111-1111-4111-8111-111111111111' as session_id,
                '/k' as path,
                '{"song_path":null}' as props_json
            ) to ? (format parquet)
            """,
            [str(part)],
        )
        writer.close()

        from promo_catalog.events_duckdb import connect_events

        con = connect_events(day="2026-08-05", local_dir=str(parquet_root))
        data = render_mod.query_dashboard_data(con)
        chart = render_mod.build_charts(data)
        spec = chart.to_dict()
        assert "vconcat" in spec
        assert len(spec["vconcat"]) == 5
