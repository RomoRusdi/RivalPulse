# Verification record — 2026-09-26

Executed from `backend/` using the local Python 3.12 environment.

| Check | Result |
| --- | --- |
| `python -m pytest -q` | **61 passed, 1 skipped** |
| `ruff check app tests scripts migrations` | **Passed** |
| `python scripts/smoke_http.py` | **Passed**: real Uvicorn HTTP listener, clean migration/seed, liveness, private access gate, company search and OpenAPI |
| `python scripts/export_contracts.py` | **Passed**: actual replay generated the saved OpenAPI and example responses |
| Clean migration upgrade/downgrade/upgrade and Alembic metadata drift check | **Passed on SQLite** |
| RQ queue delivery and duplicate job delivery | **Passed with fakeredis and an in-process RQ test worker** |
| Real PostgreSQL + Redis services | **Passed**: Compose migrations, seed, API readiness, RQ worker and reconciler started successfully |
| Docker image build / Compose / frontend proxy HTTP flow | **Passed**: same-origin private-demo login, session check and cookie-clearing logout returned 401 → 204 → 200 → 204 → 401 through Nginx. Frontend login screenshot reviewed; dashboard contract and signal detail returned through the proxy. |
| Next.js frontend | **Passed**: clean install, ESLint and production build; 15 routes generated |
| Sectors-only configuration | **Passed locally**: retired provider mode is rejected, no active alternate provider exists, missing keys fail before research is queued, and mocked Sectors reports yield cited annual briefs with guarded credit reservations. |
| Live Sectors authorization | **Passed (limited)**: one direct overview-only `TLKM` report request returned HTTP 200 with matching `TLKM.JK` identity; documented cost is 1 credit. This probe bypassed the app ledger and did not verify annual financials or a full investigation. |
| Live Sectors billing reconciliation, entitlements and full company coverage | **Not yet verified**: no credit-consuming end-to-end investigation was run with the newly configured key. |
| Live Ollama adapter | **Passed**: host and container reached installed `qwen3.8:27b`; structured output and end-to-end grounded synthesis completed |
| Official-source extraction against live HTML | **Partial**: TLKM produced evidence; the current XLSMART selector failed and the Indosat page was unavailable during rehearsal |

Coverage includes watchlist bounds/duplicates/unknown IDs; idempotency and concurrent submissions; frozen membership; immutable history; workspace-scoped conversation upserts/deletion; durable watchlist updates; baseline/unchanged/one-change runs; financial arithmetic, citation resolution and mismatched evidence rejection; missing financial data; explicit live/replay isolation; Sectors-only mode enforcement; provider retries and atomic shared credit limits; cache reuse; bounded news pagination; malformed LLM output/repair limits; SSRF, redirects, body limits and XML safety; interrupted-worker fencing/recovery/attempt exhaustion; cancellation; cursor pagination; workspace isolation; private cookie login and origin checks; and bounded Gmail digest filtering.

The initial expanded test run exposed a misplaced test assertion; it was corrected and the complete suite rerun successfully. No failing checks remain in the executed suite. One upstream Starlette/AnyIO deprecation warning remains; it does not fail the suite.

The previously configured key was rejected (`PROVIDER_AUTH_FAILED`); the newly configured local key authenticated for one overview-only request. A deliberate credit-limited end-to-end investigation is still required to confirm financial report normalization, full coverage and account billing. Retired test-mode records remain isolated and labeled in the existing database but can no longer be produced. Synthetic replay is restricted to deterministic automated tests. Qwen synthesis can remain enabled while live tool planning starts deterministic. Interpretations are labeled in progress and hypotheses remain explicit.

Known MVP limits: conservative exact event matching rather than fuzzy cross-source matching; sequential tool execution; starter official profile pages rather than a curated announcement feed; no automatic account-credit reconciliation endpoint; no quantitative package-price inference from arbitrary prose. Unknown financial currency/units/reporting scope remain unknown, with warnings and no growth calculation.

All changes remain local. Nothing was pushed to GitHub; no repository, pull request, release or deployment was created.
