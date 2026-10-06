# Verification record — 2026-10-06

Account quality update verified with isolated local test data. No live database was migrated and no real email or Sectors request was sent.

| Check | Result |
| --- | --- |
| Backend regression suite | **135 passed, 1 skipped**; the skipped PostgreSQL/Redis service test requires explicit test service URLs. One upstream Starlette/AnyIO warning remains. |
| Migration | **Passed on SQLite**: upgrade, downgrade, upgrade and metadata drift check, with existing accounts and sessions preserved. |
| Verification and session security | **Passed**: activation only after ownership proof, hashed single-use codes, expiry, attempt limit, resend cooldown, delivery failure rollback, certificate validation, existing account protection and temporary session proof on protected routes/streams. |
| Workspace allowance | **Passed**: concurrent quota reservation, global provider reserve enforcement, rollback on budget failure and remaining percentage. |
| Financial source boundary | **Passed**: stored revenue/earnings, foreign workspace rejection and no provider fetch when viewing evidence. |
| Frontend | **Passed**: TypeScript, ESLint and production build, including the new financial source route. |
| Browser review | **Passed**: email-code signup using a local synthetic inbox, verified Profile without job title, refresh, fresh-tab login requirement, remembered login after reopening, stored financial source view, independent history drawer/focus restoration, keyboard dropdowns and a 390 × 844 mobile dropdown with no page overflow. |
| API contract export | **Passed** using migrated replay data; verification, session metadata, workspace allowance and stored financial figures are documented. |

The preview used a separate SQLite database and fakeredis with replay evidence and model calls disabled. It buffers SSE; backend tests cover authentication and revocation for streams. This round does not verify real SMTP deliverability, live PostgreSQL/Redis, Sectors billing or Ollama generation. Configure verification SMTP and rebuild through the startup guide before testing new registrations with a real inbox. Existing active accounts are retained; expired pending registrations are removed. Browser restore can restore temporary tab storage, so explicit logout remains the reliable immediate revocation action.

## Historical account/AI verification — 2026-10-05

Account/AI integration verified locally. Existing work was preserved and nothing was pushed to GitHub.

| Check | Result |
| --- | --- |
| Backend suite | **105 passed, 1 skipped**, 1 upstream Starlette/AnyIO deprecation warning |
| Ruff | **Passed** for app, tests, scripts and migrations |
| Frontend ESLint and production build | **Passed**; TypeScript passed during build and **19 routes** generated |
| HTTP smoke and API contract export | **Passed** using clean migrated synthetic databases; saved OpenAPI includes account endpoints and conversation suggestions |
| Account/workspace boundary | **Passed**: CSRF, isolated AI context, watchlists/runs/signals/history, canonical owned run references, stale transcript conflicts, session revocation during SSE, shared chat capacity, disabled unowned sweeps and legacy recipient isolation |
| Browser walkthrough | **Passed**: signup, account workspace, profile save, fallback chat, cited replay research, reload persistence, logout, login restoring saved profile/research, and second-account empty history |
| Live PostgreSQL/Redis/Ollama | **Unavailable**: configured host services were unreachable and Docker Desktop's Linux engine was stopped |
| Live Sectors requests | **Not run in this round**; no provider credits consumed |

The browser walkthrough used an isolated SQLite database, fakeredis, disabled model calls and replay evidence behind a temporary loopback proxy. It verifies the real UI/account/API integration, not live Qwen generation, PostgreSQL constraints, Redis process delivery or Sectors billing. The temporary proxy buffers SSE, so browser streaming was verified through its terminal projection; session revocation while streaming is covered by a backend test. The skipped integration test requires `TEST_DATABASE_URL` and `TEST_REDIS_URL` for actual PostgreSQL/Redis.

Startup instructions are in [../../START_DEMO.md](../../START_DEMO.md); architecture and limitations are in [../../docs/ACCOUNT_AI_INTEGRATION.md](../../docs/ACCOUNT_AI_INTEGRATION.md). After starting Docker Desktop and Ollama, run `docker compose exec api python scripts/check_connections.py --probe-ai` and a deliberate live investigation to finish live-service verification.

## Historical verification — 2026-10-01

The following results describe the previous shared-demo implementation and are not evidence of a live account/AI check on 2026-10-05.

Executed from `backend/` using the local Python 3.12 environment.

| Check | Result |
| --- | --- |
| `python -m pytest -q` | **72 passed, 1 skipped** |
| `ruff check app tests scripts migrations` | **Passed** |
| `python scripts/smoke_http.py` | **Passed**: real Uvicorn HTTP listener, clean migration/seed, liveness, private access gate, company search and OpenAPI |
| `python scripts/export_contracts.py` | **Passed**: actual replay regenerated the saved OpenAPI and example responses, now including `/api/v1/chat`, the recovery stage and agent decisions |
| Clean migration upgrade/downgrade/upgrade and Alembic metadata drift check | **Passed on SQLite** |
| RQ queue delivery and duplicate job delivery | **Passed with fakeredis and an in-process RQ test worker** |
| Real PostgreSQL + Redis services | **Passed**: Compose migrations, seed, API readiness, RQ worker and reconciler started successfully |
| Docker image build / Compose / frontend proxy HTTP flow | **Passed**: same-origin private-demo login, session check and cookie-clearing logout returned 401 → 204 → 200 → 204 → 401 through Nginx. Frontend login screenshot reviewed; dashboard contract and signal detail returned through the proxy. |
| Next.js frontend | **Passed**: clean install, ESLint and production build; 15 routes generated |
| Sectors-only configuration | **Passed locally**: retired provider mode is rejected, no active alternate provider exists, missing keys fail before research is queued, and mocked Sectors reports yield cited annual briefs with guarded credit reservations. |
| Live Sectors authorization | **Passed (limited)**: one direct overview-only `TLKM` report request returned HTTP 200 with matching `TLKM.JK` identity; documented cost is 1 credit. This probe bypassed the app ledger and did not verify annual financials or a full investigation. |
| Live Sectors billing reconciliation, entitlements and full company coverage | **Not yet verified**: no credit-consuming end-to-end investigation was run with the newly configured key. |
| Live Ollama adapter | **Passed**: host and container reached installed `qwen3.8:27b`; structured output and end-to-end grounded synthesis completed |
| Official-source extraction against live HTML | **Passed for TLKM, partial elsewhere**: the Telkom newsroom yielded three classified announcements (two Partnership, one Product) with dates and headlines intact, and the Telkom company-profile page correctly yielded **zero** events. XLSMART's pages expose no `<main>` element, so its selector is now `body`; its newsroom is client-rendered and still yields nothing to a plain fetch. The Indosat page exceeds the 500 KiB body cap and returns `RESPONSE_TOO_LARGE`. |
| Announcement classification | **Passed**: word-anchored rules separate announcements from corporate boilerplate. Regression tests cover the two substring faults found during review — `mou` matching inside "amount", and a bare `advertising` matching cookie policies. |
| Gap diagnosis and recovery round | **Passed**: a company whose first approved pages fail is re-read from its remaining pages and the gap closes; a company with no remaining pages records the reason and issues **no** recovery request, so an unreachable source cannot consume budget. Verified by tests and by a local end-to-end run against live pages. |
| Provider news as competitive evidence | **Passed against a mocked transport**: Sectors news is stored under the `sectors_news` provider, classified into events, and cited by the resulting signals; non-announcement filler produces no signal. A news snapshot cannot satisfy the financial-evidence check. **Not yet exercised against the live Sectors news endpoint.** |
| Conversation without the pipeline | **Passed**: small talk and product questions are answered by `/api/v1/chat` from the workspace and stored findings; tests assert it creates no run and spends no credits. A model reply containing a figure (Rp, %, triliun…) is replaced with a pointer to a cited investigation. Live check against local `qwen3.8:27b`: English and Indonesian small talk answered in the user's language, and a request for a bank's revenue was declined in favour of an investigation. Replies take roughly 11 s, about 35 s on a cold model. |
| Bilingual routing and company aliases | **Passed (29 cases, standalone harness)**: English and Bahasa Indonesia commands, research triggers and replies; everyday names resolve to tickers (BRI→BBRI, Mandiri→BMRI, BCA→BBCA); tickers that are also ordinary words (`buka`, `jago`) never match in lower case. Research naming a company outside the watchlist stops before spending credits. The frontend has no test runner, so these cases are not in CI. |
| Rejected AI wording during analysis | **Passed**: when the model's interpretation fails validation, the run still publishes its cited findings with reviewed conservative wording and records `validated_fallback`; a model outage still fails the run explicitly. |
| Agent decisions exposed to the frontend | **Passed**: the run payload carries real tool invocations with cache status and credit cost, plus route, planner, spend and unresolved gaps, rather than the stage list. |

Coverage includes watchlist bounds/duplicates/unknown IDs; idempotency and concurrent submissions; frozen membership; immutable history; workspace-scoped conversation upserts/deletion; durable watchlist updates; baseline/unchanged/one-change runs; financial arithmetic, citation resolution and mismatched evidence rejection; missing financial data; explicit live/replay isolation; Sectors-only mode enforcement; provider retries and atomic shared credit limits; cache reuse; bounded news pagination; malformed LLM output/repair limits; SSRF, redirects, body limits and XML safety; interrupted-worker fencing/recovery/attempt exhaustion; cancellation; cursor pagination; workspace isolation; private cookie login and origin checks; and bounded Gmail digest filtering.

A recovery test exposed two real defects during this round: approved sources were ordered by random UUID, so "the first two pages" varied between runs; and a failed fetch was indistinguishable from an unread page, which made the agent retry sources it had already tried. Both were fixed and are covered by tests. The initial expanded test run exposed a misplaced test assertion; it was corrected and the complete suite rerun successfully. No failing checks remain in the executed suite. One upstream Starlette/AnyIO deprecation warning remains; it does not fail the suite.

The previously configured key was rejected (`PROVIDER_AUTH_FAILED`); the newly configured local key authenticated for one overview-only request. A deliberate credit-limited end-to-end investigation is still required to confirm financial report normalization, full coverage and account billing. Retired test-mode records remain isolated and labeled in the existing database but can no longer be produced. Synthetic replay is restricted to deterministic automated tests. Qwen synthesis can remain enabled while live tool planning starts deterministic. Interpretations are labeled in progress and hypotheses remain explicit.

Known MVP limits: conservative exact event matching rather than fuzzy cross-source matching; sequential tool execution; starter official profile pages rather than a curated announcement feed; no automatic account-credit reconciliation endpoint; no quantitative package-price inference from arbitrary prose. Unknown financial currency/units/reporting scope remain unknown, with warnings and no growth calculation.

All changes remain local. Nothing was pushed to GitHub; no repository, pull request, release or deployment was created.
