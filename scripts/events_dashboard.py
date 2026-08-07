"""Product-event dashboard: DuckDB over S3 Parquet (local Marimo app)."""

import marimo

__generated_with = "0.23.16"
app = marimo.App(width="medium", app_title="Promo events")


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell
def _():
    import math
    import os

    import altair as alt

    from promo_catalog.events_duckdb import (
        DEFAULT_BUCKET,
        DEFAULT_PROFILE,
        connect_events,
    )

    return DEFAULT_BUCKET, DEFAULT_PROFILE, alt, connect_events, math, os


@app.cell
def _(mo):
    mo.md("""
    # Promo product events

    Reads compacted Parquet from S3 via DuckDB (`httpfs`). Submit the form to
    (re)query — filters do not hit S3 until you click **Load**.
    """)


@app.cell
def _(DEFAULT_BUCKET, DEFAULT_PROFILE, mo, os):
    filters = (
        mo.md(
            """
    **Source**

    {bucket}

    {day}

    {profile}
    """
        )
        .batch(
            bucket=mo.ui.text(
                value=os.environ.get("EVENTS_BUCKET", DEFAULT_BUCKET),
                label="S3 bucket",
                full_width=True,
            ),
            day=mo.ui.text(
                value="*",
                label="Partition day (YYYY-MM-DD or *)",
                full_width=True,
            ),
            profile=mo.ui.text(
                value=os.environ.get("AWS_PROFILE", DEFAULT_PROFILE),
                label="AWS profile",
                full_width=True,
            ),
        )
        .form(submit_button_label="Load")
    )
    filters
    return (filters,)


@app.cell
def _(connect_events, filters, mo):
    if filters.value is None:
        mo.stop(True, mo.md("_Submit **Load** to query S3._"))

    bucket = filters.value["bucket"].strip() or None
    day = filters.value["day"].strip() or "*"
    profile = filters.value["profile"].strip() or None

    try:
        con = connect_events(bucket=bucket, day=day, profile=profile)
        _probe = con.execute("select count(*)::bigint as n from events").fetchone()
        row_count = int(_probe[0]) if _probe else 0
    except Exception as exc:  # noqa: BLE001 — surface any S3/DuckDB failure in UI
        mo.stop(True, mo.md(f"**Failed to load events**\n\n```\n{exc}\n```"))

    mo.md(f"Loaded **{row_count:,}** rows from `s3://{bucket}/events/parquet/dt={day}/`.")
    return con, row_count


@app.cell
def _(con, mo, row_count):
    if row_count == 0:
        mo.stop(True, mo.md("No rows in this partition — try another day or `*`."))

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
    return by_day, by_event, completion, top_paths, top_plays, top_searches


@app.cell
def _(alt, by_event, completion, math, mo):
    event_chart = (
        alt.Chart(by_event)
        .mark_bar()
        .encode(
            x=alt.X("n:Q", title="Events"),
            y=alt.Y("event:N", sort="-x", title=None),
            tooltip=["event", "n"],
        )
        .properties(height=220, title="Event mix")
    )

    started = int(completion.loc[0, "started"])
    completed = int(completion.loc[0, "completed"])
    pct = completion.loc[0, "completion_pct"]
    pct_missing = pct is None or (isinstance(pct, float) and math.isnan(pct))
    pct_label = "n/a" if pct_missing else f"{pct}%"

    mo.hstack(
        [
            mo.ui.altair_chart(event_chart),
            mo.md(
                f"""
    ### Play completion

    - Started: **{started:,}**
    - Completed: **{completed:,}**
    - Rate: **{pct_label}**
    """
            ),
        ],
        justify="start",
        gap=2,
    )


@app.cell
def _(alt, by_day, mo):
    day_panel = (
        mo.md("_No daily breakdown._")
        if len(by_day) == 0
        else mo.ui.altair_chart(
            alt.Chart(by_day)
            .mark_line(point=True)
            .encode(
                x=alt.X("day:T", title="Day"),
                y=alt.Y("n:Q", title="Events"),
                tooltip=["day", "n"],
            )
            .properties(height=240, title="Events by day")
        )
    )
    day_panel


@app.cell
def _(mo, top_paths, top_plays, top_searches):
    mo.vstack(
        [
            mo.md("### Top page paths"),
            top_paths,
            mo.md("### Top plays (`song_path`)"),
            top_plays,
            mo.md("### Top searches"),
            top_searches,
        ]
    )


if __name__ == "__main__":
    app.run()
