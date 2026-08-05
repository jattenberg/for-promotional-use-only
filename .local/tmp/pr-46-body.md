## Summary

- Replace `react-responsive-audio-player` with native `<audio>` and matching transport UI (prev/play/progress/next).
- Advance to the next track across letters using `index.json` order when the current letter list ends; prev at start clears playback.
- Update Vitest harness for native audio (no player mock).

## Test plan

- [x] `npm test` — 39 passed
- [x] `npm run build` — `dist/` ok (`index-DteYpRfH.js` ~195 KB)
- [x] `uv run python tests/test_bucketing.py` — ok
- [x] `PROMO_SMOKE_BASE=http://127.0.0.1:4173 python3 scripts/prod_smoke.py` — ALL_PASS (local preview, Phase 4 build)
- [x] `PROMO_SMOKE_BASE=http://127.0.0.1:4173 node scripts/prod_ui_smoke.mjs` — ALL_UI_PASS (local preview)
- [x] Cross-letter next — `node scripts/cross_letter_next_smoke.mjs` on preview: last `/num` track → next → `/a` (`A Place Called Bliss…`)
- [ ] After merge + deploy: rerun `prod_smoke.py` and `prod_ui_smoke.mjs` against `https://for-promotional-use-only.com`
