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
- [ ] Set GitHub secret `VITE_PROMO_EVENTS_KEY` from `.state/promo-events-key.txt`
- [ ] Commit / PR / merge so production SPA builds with the key

