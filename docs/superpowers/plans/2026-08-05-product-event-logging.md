# Product Event Logging Implementation Plan

> **For agentic workers:** implement task-by-task; check boxes as you go.

**Goal:** Ship same-origin product event logging to S3 with daily Parquet and DuckDB queries.

**Architecture:** SPA batches → CloudFront `/events` → Lambda Function URL → S3 NDJSON → EventBridge compact → Parquet → DuckDB.

**Tech Stack:** Vite/React, Python 3.12 Lambda, S3, CloudFront, DuckDB, pyarrow (compact only).

## Tasks

- [x] Design spec
- [x] Ingest + compact Lambda handlers
- [x] Phase 3 infra scripts (bucket, deploy, CloudFront)
- [x] SPA `events.js` + wiring (page/play/search/favorite)
- [x] Tests + CI env for `VITE_PROMO_EVENTS_KEY`
- [x] Events bucket + IAM role + both Lambdas
- [x] Function URL public invoke (InvokeFunctionUrl + InvokeFunction)
- [x] CloudFront `/events*` → Function URL
- [x] Smoke: CF POST /events → 204 / 401 + S3 raw objects
- [x] Set GitHub secret `VITE_PROMO_EVENTS_KEY` from `.state/promo-events-key.txt`
- [x] Commit / PR / merge so production SPA builds with the key

Follow-ups after merge (2026-08-05):
- [x] Land [#49](https://github.com/jattenberg/for-promotional-use-only/pull/49) (retry/backoff + header logo) — merged + deployed
- [x] Confirm first compact wrote Parquet (`events/parquet/dt=2026-08-05/part-000.parquet`, 8 rows; daily rule still ENABLED)
- [x] Confirm production SPA bundle inlines a non-empty events key (`VITE_PROMO_EVENTS_KEY` secret present; bundle has secret-like literal)

