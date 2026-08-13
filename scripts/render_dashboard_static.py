#!/usr/bin/env python3
"""Render a static HTML promo-events dashboard from DuckDB over Parquet."""

from __future__ import annotations

import argparse
import html
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import altair as alt
from promo_catalog.events_duckdb import DEFAULT_BUCKET, DEFAULT_PROFILE, connect_events


@dataclass(frozen=True)
class DashboardData:
    """Query results for dashboard panels."""

    row_count: int
    by_event: object
    by_day: object
    top_paths: object
    top_plays: object
    top_searches: object
    started: int
    completed: int
    completion_pct: float | None


def query_dashboard_data(con) -> DashboardData:
    """
    Run the same aggregations as scripts/events_dashboard.py.

    Args:
        con: DuckDB connection with an ``events`` view.

    Returns:
        DashboardData: Aggregated frames and completion metrics.
    """
    probe = con.execute("select count(*)::bigint as n from events").fetchone()
    row_count = int(probe[0]) if probe else 0

    by_event = con.execute(
        """
        select event, count(*)::bigint as n
        from events
        group by 1
        order by n desc
        """
    ).fetchdf()

    by_day = con.execute(
        """
        select cast(dt as varchar) as day, count(*)::bigint as n
        from events
        group by 1
        order by 1
        """
    ).fetchdf()

    top_paths = con.execute(
        """
        select path, count(*)::bigint as n
        from events
        where event = 'page_view'
        group by 1
        order by n desc
        limit 20
        """
    ).fetchdf()

    top_plays = con.execute(
        """
        select
          json_extract_string(props_json, '$.song_path') as song_path,
          count(*)::bigint as n
        from events
        where event = 'play_started'
          and json_extract_string(props_json, '$.song_path') is not null
        group by 1
        order by n desc
        limit 20
        """
    ).fetchdf()

    top_searches = con.execute(
        """
        select
          json_extract_string(props_json, '$.query') as query,
          count(*)::bigint as n
        from events
        where event = 'search'
          and coalesce(json_extract_string(props_json, '$.query'), '') <> ''
        group by 1
        order by n desc
        limit 20
        """
    ).fetchdf()

    completion = con.execute(
        """
        select
          count(*) filter (where event = 'play_started')::bigint as started,
          count(*) filter (where event = 'play_completed')::bigint as completed,
          case
            when count(*) filter (where event = 'play_started') = 0 then null
            else round(
              100.0 * count(*) filter (where event = 'play_completed')
              / count(*) filter (where event = 'play_started'),
              1
            )
          end as completion_pct
        from events
        """
    ).fetchdf()

    started = int(completion.loc[0, "started"])
    completed = int(completion.loc[0, "completed"])
    pct = completion.loc[0, "completion_pct"]
    pct_value = None if pct is None or (isinstance(pct, float) and math.isnan(pct)) else float(pct)

    return DashboardData(
        row_count=row_count,
        by_event=by_event,
        by_day=by_day,
        top_paths=top_paths,
        top_plays=top_plays,
        top_searches=top_searches,
        started=started,
        completed=completed,
        completion_pct=pct_value,
    )


def build_charts(data: DashboardData) -> alt.TopLevelMixin:
    """
    Build Altair charts mirroring the Marimo dashboard panels.

    Args:
        data (DashboardData): Aggregated query results.

    Returns:
        alt.TopLevelMixin: Vertically stacked chart bundle.
    """
    event_chart = (
        alt.Chart(data.by_event)
        .mark_bar()
        .encode(
            x=alt.X("n:Q", title="Events"),
            y=alt.Y("event:N", sort="-x", title=None),
            tooltip=["event", "n"],
        )
        .properties(height=220, title="Event mix")
    )

    day_chart = (
        alt.Chart(data.by_day)
        .mark_line(point=True)
        .encode(
            x=alt.X("day:T", title="Day"),
            y=alt.Y("n:Q", title="Events"),
            tooltip=["day", "n"],
        )
        .properties(height=240, title="Events by day")
    )

    paths_chart = (
        alt.Chart(data.top_paths)
        .mark_bar()
        .encode(
            x=alt.X("n:Q", title="Views"),
            y=alt.Y("path:N", sort="-x", title=None),
            tooltip=["path", "n"],
        )
        .properties(height=280, title="Top page paths")
    )

    plays_chart = (
        alt.Chart(data.top_plays)
        .mark_bar()
        .encode(
            x=alt.X("n:Q", title="Plays"),
            y=alt.Y("song_path:N", sort="-x", title=None),
            tooltip=["song_path", "n"],
        )
        .properties(height=280, title="Top plays (song_path)")
    )

    searches_chart = (
        alt.Chart(data.top_searches)
        .mark_bar()
        .encode(
            x=alt.X("n:Q", title="Searches"),
            y=alt.Y("query:N", sort="-x", title=None),
            tooltip=["query", "n"],
        )
        .properties(height=280, title="Top searches")
    )

    return alt.vconcat(event_chart, day_chart, paths_chart, plays_chart, searches_chart)


def completion_html(data: DashboardData) -> str:
    """
    Render play-completion summary markup.

    Args:
        data (DashboardData): Aggregated query results.

    Returns:
        str: HTML fragment for the completion panel.
    """
    pct_label = "n/a" if data.completion_pct is None else f"{data.completion_pct:g}%"
    return (
        '<section class="completion">'
        "<h2>Play completion</h2>"
        "<ul>"
        f"<li>Started: <strong>{data.started:,}</strong></li>"
        f"<li>Completed: <strong>{data.completed:,}</strong></li>"
        f"<li>Rate: <strong>{html.escape(pct_label)}</strong></li>"
        "</ul>"
        "</section>"
    )


def dataframe_table_html(frame, label_col: str, value_col: str = "n", title: str = "") -> str:
    """
    Render a small dataframe as an HTML table for accessibility fallbacks.

    Args:
        frame: Tabular query result.
        label_col (str): Column used for row labels.
        value_col (str, default: "n"): Numeric count column.
        title (str, default: ""): Optional table caption.

    Returns:
        str: HTML table fragment.
    """
    rows = "".join(
        (f"<tr><td>{html.escape(str(row[label_col]))}</td><td>{int(row[value_col]):,}</td></tr>")
        for _, row in frame.iterrows()
    )
    caption = f"<caption>{html.escape(title)}</caption>" if title else ""
    return (
        f"<table>{caption}<thead><tr><th>{html.escape(label_col)}</th><th>{value_col}</th></tr></thead>"
        f"<tbody>{rows}</tbody></table>"
    )


def render_dashboard_html(
    *,
    data: DashboardData,
    source_label: str,
    charts: alt.TopLevelMixin,
) -> str:
    """
    Compose a self-contained HTML page with embedded Vega-Lite charts.

    Args:
        data (DashboardData): Aggregated query results.
        source_label (str): Human-readable source description.
        charts (alt.TopLevelMixin): Altair chart bundle.

    Returns:
        str: Full HTML document.
    """
    chart_html = charts.to_html(fullhtml=False)
    tables = "".join(
        [
            dataframe_table_html(data.top_paths, "path", title="Top page paths"),
            dataframe_table_html(data.top_plays, "song_path", title="Top plays"),
            dataframe_table_html(data.top_searches, "query", title="Top searches"),
        ]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Promo product events</title>
  <style>
    body {{
      font-family: system-ui, sans-serif;
      margin: 1.5rem auto;
      max-width: 960px;
      line-height: 1.5;
      color: #111;
    }}
    h1 {{ margin-bottom: 0.25rem; }}
    .meta {{ color: #444; margin-bottom: 1.5rem; }}
    .completion ul {{ margin: 0.5rem 0 1.5rem; padding-left: 1.25rem; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0 2rem;
      font-size: 0.95rem;
    }}
    th, td {{
      border-bottom: 1px solid #ddd;
      padding: 0.35rem 0.5rem;
      text-align: left;
    }}
    caption {{
      caption-side: top;
      font-weight: 600;
      margin-bottom: 0.35rem;
      text-align: left;
    }}
  </style>
</head>
<body>
  <h1>Promo product events</h1>
  <p class="meta">Loaded <strong>{data.row_count:,}</strong> rows from {html.escape(source_label)}.</p>
  {completion_html(data)}
  {chart_html}
  <section class="tables">
    <h2>Tables</h2>
    {tables}
  </section>
</body>
</html>
"""


def render_dashboard(
    *,
    bucket: str | None,
    day: str,
    local_dir: str | None,
    profile: str | None,
    output_path: Path,
) -> DashboardData:
    """
    Query events and write a static dashboard HTML file.

    Args:
        bucket (str | None): Events S3 bucket (ignored when local_dir is set).
        day (str): Hive partition day or ``*``.
        local_dir (str | None): Local parquet root for offline renders.
        profile (str | None): AWS profile for DuckDB httpfs.
        output_path (Path): Destination HTML path.

    Returns:
        DashboardData: Aggregated query results used for the render.

    Raises:
        RuntimeError: When the events view contains zero rows.
    """
    con = connect_events(bucket=bucket, day=day, local_dir=local_dir, profile=profile)
    data = query_dashboard_data(con)
    if data.row_count == 0:
        raise RuntimeError("No rows in the selected partition.")

    resolved_bucket = bucket or os.environ.get("EVENTS_BUCKET", DEFAULT_BUCKET)
    source_label = (
        f"`{local_dir}` (dt={day})"
        if local_dir
        else f"`s3://{resolved_bucket}/events/parquet/dt={day}/`"
    )
    charts = build_charts(data)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        render_dashboard_html(data=data, source_label=source_label, charts=charts),
        encoding="utf-8",
    )
    return data


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """
    Parse CLI arguments for the static dashboard renderer.

    Args:
        argv (list[str] | None, default: None): Optional argv override for tests.

    Returns:
        argparse.Namespace: Parsed arguments.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--day",
        default=os.environ.get("EVENTS_DAY", "*"),
        help="Partition day YYYY-MM-DD, or * for all (default: %(default)s)",
    )
    parser.add_argument(
        "--bucket",
        default=os.environ.get("EVENTS_BUCKET", DEFAULT_BUCKET),
        help="Events S3 bucket (default: %(default)s)",
    )
    parser.add_argument(
        "--profile",
        default=os.environ.get("AWS_PROFILE", DEFAULT_PROFILE),
        help="AWS profile for DuckDB httpfs (default: %(default)s)",
    )
    parser.add_argument(
        "--local-dir",
        default=os.environ.get("EVENTS_LOCAL_DIR"),
        help="Local parquet root (skips S3/httpfs)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("dist-dashboard/index.html"),
        help="Output HTML path (default: %(default)s)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """
    CLI entrypoint.

    Args:
        argv (list[str] | None, default: None): Optional argv override.

    Returns:
        int: Process exit code.
    """
    args = parse_args(argv)
    try:
        data = render_dashboard(
            bucket=None if args.local_dir else args.bucket,
            day=args.day,
            local_dir=args.local_dir,
            profile=None if args.local_dir else args.profile,
            output_path=args.output,
        )
    except Exception as exc:  # noqa: BLE001 — surface render failures to CI logs
        print(f"render failed: {exc}", file=sys.stderr)
        return 1

    print(f"Wrote {args.output} ({data.row_count:,} rows, day={args.day})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
