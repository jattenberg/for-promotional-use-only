# Product Event Logging Design

## Goal

Capture product-usage events (plays, search, favorites, letter routes) from the
static SPA with near-zero AWS cost, queryable locally via DuckDB over Parquet.

## Architecture

```
SPA batch POST /events
  → CloudFront (same-origin, no cache)
    → Lambda Function URL (ingest)
      → s3://…-events/events/raw/dt=YYYY-MM-DD/{ulid}.ndjson
EventBridge daily
  → Lambda (compact)
      → s3://…-events/events/parquet/dt=YYYY-MM-DD/part-000.parquet
DuckDB (local) reads parquet/
```

## Decisions

| Topic | Choice |
|---|---|
| Purpose | Product usage (not ops access logs) |
| Analytics | S3 + DuckDB; Parquet compaction from day one |
| Edge | Same-origin `POST /events` via CloudFront |
| Auth | Shared secret `X-Promo-Key` (build-time Vite env) |
| Bucket | Dedicated `for-promotional-use-only-events` |

## Event envelope

```json
{
  "ts": "2026-08-05T16:42:01.123Z",
  "event": "play_started",
  "session_id": "uuid",
  "path": "/k",
  "props": { "song_path": "mixtape/..." }
}
```

### v1 events

- `page_view` — letter/route load
- `play_started` — audio `play`
- `play_completed` — audio `ended`
- `search` — debounced non-empty query
- `favorite_add` / `favorite_remove`

No PII. `session_id` from `sessionStorage`. Client batches (~5s / pagehide), max 50
events / 32KB per POST. Use `fetch` + `keepalive` (not `sendBeacon`) so the key
header can be set.

## Non-goals (v1)

Real-time dashboards, DynamoDB, Athena, WAF, perfect auth against determined scrapers.
