# Verification record — 2026-09-26

Executed from `backend/` using the local Python 3.12 environment.

| Check | Result |
| --- | --- |
| `python -m pytest -q` | **39 passed, 1 skipped** |
| `ruff check app tests scripts migrations` | **Passed** |
| `python scripts/smoke_http.py` | **Passed**: real Uvicorn HTTP listener, clean migration/seed, liveness, private access gate, company search and OpenAPI |
| `python scripts/export_contracts.py` | **Passed**: actual replay generated the saved OpenAPI and example responses |
| Clean migration upgrade/downgrade/upgrade and Alembic metadata drift check | **Passed on SQLite** |
| RQ queue delivery and duplicate job delivery | **Passed with fakeredis and an in-process RQ test worker** |
| Real PostgreSQL + Redis services | **Passed**: Compose migrations, seed, API readiness, RQ worker and reconciler started successfully |
| Docker image build / Compose / frontend proxy HTTP flow | **Passed**: same-origin login, dashboard contract and signal detail returned through Nginx; interactive browser review remains manual |
| Next.js frontend | **Passed**: clean install, ESLint and production build; 15 routes generated |
| Explicit Yahoo testing mode | **Passed**: real Yahoo annual fundamentals produced three isolated financial snapshots and zero Sectors credits; a financial-only investigation completed with 2025 revenue/earnings for all three companies, a Qwen-selected three-tool plan, and a validated, claim-linked Qwen interpretation (3 LLM calls). Grouped Qwen tool requests are split into bounded company calls; invalid plans use a visibly marked safe fallback. Approved-page coverage remains separate. |
| Live Sectors calls, billing reconciliation, entitlements and company coverage | **Blocked**: a live run reached Sectors, but the locally preserved credential was rejected with `PROVIDER_AUTH_FAILED`; a valid key is still required |
| Live Ollama adapter | **Passed**: host and container reached installed `qwen3.8:27b`; structured output and end-to-end grounded synthesis completed |
| Official-source extraction against live HTML | **Partial**: TLKM produced evidence; the current XLSMART selector failed and the Indosat page was unavailable during rehearsal |

Coverage includes watchlist bounds/duplicates/unknown IDs; idempotency and concurrent submissions; frozen membership; immutable history; bounded workspace-scoped conversation upserts/deletion; durable agent-issued watchlist updates; baseline/unchanged/one-change runs; financial arithmetic, citation resolution and mismatched evidence rejection; missing financial data; explicit live/Yahoo/replay isolation; provider retries and atomic shared credit limits; Yahoo identity validation and zero-credit accounting; cache reuse; bounded news pagination; malformed LLM output/repair limits; SSRF, redirects, body limits and XML safety; interrupted-worker fencing/recovery/attempt exhaustion; cancellation; cursor pagination; workspace isolation; private cookie login and origin checks; and bounded Gmail digest filtering that suppresses baseline and below-threshold findings.

The initial expanded test run exposed a misplaced test assertion; it was corrected and the complete suite rerun successfully. No failing checks remain in the executed suite. One upstream Starlette/AnyIO deprecation warning remains; it does not fail the suite.

The live adapters are implemented, but Yahoo testing does not establish live Sectors correctness. Yahoo runs are visibly labeled, isolated by mode, and never substituted for failed Sectors calls. Synthetic replay is restricted to deterministic automated tests. The code-level LLM default remains off for tests; local configuration enables Qwen while keeping planning deterministic. Interpretations are labeled in progress and hypotheses remain explicit.

Known MVP limits: conservative exact event matching rather than fuzzy cross-source matching; sequential tool execution; starter official profile pages rather than a curated announcement feed; no automatic account-credit reconciliation endpoint; no quantitative package-price inference from arbitrary prose. Unknown financial currency/units/reporting scope remain unknown, with warnings and no growth calculation.

All changes remain local. Nothing was pushed to GitHub; no repository, pull request, release or deployment was created.
