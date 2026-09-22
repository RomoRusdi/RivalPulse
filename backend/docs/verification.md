# Verification record — 2026-09-22

Executed from `backend/` using the local Python 3.12 environment.

| Check | Result |
| --- | --- |
| `python -m pytest -q` | **27 passed, 1 skipped** |
| `ruff check app tests scripts migrations` | **Passed** |
| `python scripts/smoke_http.py` | **Passed**: real Uvicorn HTTP listener, clean migration/seed, liveness, private access gate, company search and OpenAPI |
| `python scripts/export_contracts.py` | **Passed**: actual replay generated the saved OpenAPI and example responses |
| Clean migration upgrade/downgrade/upgrade and Alembic metadata drift check | **Passed on SQLite** |
| RQ queue delivery and duplicate job delivery | **Passed with fakeredis and an in-process RQ test worker** |
| Real PostgreSQL + Redis integration | **Skipped**: test service URLs not supplied; Docker and native PostgreSQL/Redis executables unavailable |
| Docker image build / Compose / frontend proxy browser flow | **Not run**: Docker unavailable |
| Live Sectors calls, billing reconciliation, entitlements and company coverage | **Not run**: no live credentials configured or consumed |
| Live LLM adapter | **Not run**: no model endpoint/credentials configured |
| Official-source extraction against live HTML | **Not run**: starter selectors need live verification before demo reliance |

Coverage includes watchlist bounds/duplicates/unknown IDs; idempotency and concurrent submissions; frozen membership; immutable history; baseline/unchanged/one-change runs; financial arithmetic, citation resolution and mismatched evidence rejection; missing financial data; explicit live/replay isolation; provider retries and atomic shared credit limits; cache reuse; bounded news pagination; malformed LLM output/repair limits; SSRF, redirects, body limits and XML safety; interrupted-worker fencing/recovery/attempt exhaustion; cancellation; cursor pagination; workspace isolation; private cookie login and origin checks.

The initial expanded test run exposed a misplaced test assertion; it was corrected and the complete suite rerun successfully. No failing checks remain in the executed suite. One upstream Starlette/AnyIO deprecation warning remains; it does not fail the suite.

The live adapters are implemented, but simulated HTTP responses and synthetic XTS metrics do not establish live provider correctness. Replay is visibly labeled and never substituted for failed live calls. The optional LLM defaults off; deterministic interpretations are labeled in progress, and hypotheses remain explicit.

Known MVP limits: conservative exact event matching rather than fuzzy cross-source matching; sequential tool execution; starter official profile pages rather than a curated announcement feed; no automatic account-credit reconciliation endpoint; no quantitative package-price inference from arbitrary prose. Unknown financial currency/units/reporting scope remain unknown, with warnings and no growth calculation.

All changes remain local. Nothing was pushed to GitHub; no repository, pull request, release or deployment was created.
