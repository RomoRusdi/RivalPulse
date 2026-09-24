# RivalPulse backend

FastAPI, SQLAlchemy/Alembic, PostgreSQL, Redis/RQ, HTTPX, and an explicit Python research agent. All implementation files are inside `backend/`; the frontend is unchanged.

Workflow: create a watchlist → submit a queued investigation → collect Sectors and approved public evidence → compare successful baselines → validate cited findings → publish immutable revisions. Repeating identical evidence produces no new revision or alert. First observations are labeled `baseline`.

## Start with Docker Compose

Run from this directory. Docker Desktop with Linux containers is required.

```powershell
Copy-Item .env.example .env
# Edit .env: set a private DEMO_ACCESS_TOKEN of at least 16 characters.
# For the credential-free synthetic demonstration, explicitly set MODE=replay.
docker compose up --build -d
docker compose logs -f api worker reconciler
```

Compose waits for PostgreSQL and Redis, runs migrations, seeds three companies and a watchlist, then starts the API, RQ worker, and reconciler. Data persists in named volumes. Services bind to loopback. Stop with `docker compose down`; omit `--volumes` to retain history.

- Interactive contracts: [http://localhost:8000/docs](http://localhost:8000/docs). Use **Authorize** with the private demo token.
- Liveness: `GET /api/v1/health/live`.
- Readiness: `GET /api/v1/health/ready` checks migration presence, database, Redis, and access configuration.
- `MODE=live` is the default. Live requests never fall back to replay.

Manual migration/seed commands:

```powershell
docker compose run --rm migrate
docker compose run --rm seed
```

## Local Python development

Python 3.11+; Python 3.12 is used by the container. The production RQ worker uses Linux process isolation; use Docker on Windows.

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[test]"
Copy-Item .env.example .env
docker compose up -d postgres redis
.venv/Scripts/alembic.exe upgrade head
.venv/Scripts/python.exe -m app.seed
.venv/Scripts/uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

On Linux/macOS, replace `.venv/Scripts/` with `.venv/bin/`. Start the worker and reconciler in separate shells:

```sh
python -m app.jobs
python -m app.jobs reconcile
```

For this Windows workspace, `.venv` has already been created locally and dependencies installed. It is ignored by Git.

## Try an investigation

PowerShell example using the seeded watchlist:

```powershell
$headers = @{ Authorization = 'Bearer YOUR_PRIVATE_DEMO_TOKEN' }
$base = 'http://localhost:8000/api/v1'
$watchlists = Invoke-RestMethod "$base/watchlists" -Headers $headers
$body = @{ watchlist_id = $watchlists.items[0].id; query = 'Compare product and partnership developments' } | ConvertTo-Json
$runHeaders = $headers.Clone()
$runHeaders['Idempotency-Key'] = 'demo-run-001'
$accepted = Invoke-RestMethod "$base/research-runs" -Method Post -Headers $runHeaders -ContentType 'application/json' -Body $body
Invoke-RestMethod "http://localhost:8000$($accepted.status_url)" -Headers $headers
Invoke-RestMethod "$base/signals" -Headers $headers
```

Poll the status URL every two seconds until `completed`, `partial`, or `failed`. Reuse an idempotency key to retrieve the same request; use a **new** key to investigate again. Reusing a key with different input returns `409`. One active run per watchlist is enforced by a database unique index.

Create a watchlist with `POST /api/v1/watchlists`:

```json
{
  "name": "Telecom competitors",
  "objective": "Compare product positioning",
  "company_ids": ["UUID_FROM_COMPANY_SEARCH", "ANOTHER_COMPANY_UUID"]
}
```

Find IDs with `GET /api/v1/companies?query=ISAT`. Watchlists require 2–5 distinct catalog companies. Workspace identity is established by server configuration; client-supplied workspace fields are rejected.

## API contracts and frontend integration

Versioned endpoints cover company search; watchlist create/list/detail/edit; research submission/status/history; signal list/detail/revisions; and health. Lists use `{ "items": [], "next_cursor": null }`. Signal filters include `watchlist_id`, `severity`, and `mode`. Research submission returns **202**, `id`, `mode`, `status`, and `status_url`. Errors contain `code`, `message`, `retryable`, and `request_id`.

- [docs/openapi.json](docs/openapi.json): canonical typed OpenAPI contract.
- [docs/examples.json](docs/examples.json): actual synthetic replay output, including a completed run, evidence, signal detail, and frontend dashboard.
- `python scripts/export_contracts.py`: regenerate both from a clean, migrated temporary database.

The existing frontend's `schemas.ts` is supported by `GET /dashboard`, `GET /signals/{id}`, `POST /runs`, `GET /runs/{id}/stream` (SSE), and `POST /runs/{id}/cancel`. Canonical terminal success states map to the legacy frontend's `complete`; partial coverage remains explicit in the summary and `coverageStatus`. Replay appears in titles and summaries because the legacy frontend schema discards extra fields. The canonical API retains full citation metadata.

The frontend currently sends no authorization header or cross-origin cookie. Use the included **same-origin proxy**, with the frontend development server on port 3000:

```dotenv
# frontend/.env.local (set these yourself; frontend files were not edited)
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8080/backend
```

```powershell
docker compose --profile frontend up -d frontend-proxy
```

Open [http://localhost:8080/backend/demo/login](http://localhost:8080/backend/demo/login), enter the private token, then open [http://localhost:8080](http://localhost:8080). Login establishes an HttpOnly, SameSite cookie for same-origin fetches and SSE. The `/backend/` prefix avoids collisions between frontend pages and legacy API paths. Restart the frontend after changing its environment. A browser/proxy check still requires Docker and the running frontend.

For a separate API client, send `Authorization: Bearer <token>`. HTTP Basic is also accepted, with any username and the token as password. Do not put the token or Sectors/LLM keys into `NEXT_PUBLIC_*` variables.

## Providers, agent, and evidence

Sectors v2 uses server-side credentials and explicit report sections. The default run requests `overview,financials` for each company (two credits per cold report). Optional peer, bounded news, and structured screener adapters are available; default public signals come directly from approved official pages. Each retry reserves credits because unsuccessful requests may still be billed. Shared and per-run spend are reserved atomically in PostgreSQL; unknown outcomes remain charged. `CREDIT_TOTAL=1000` and a 200-credit reserve are configurable assumptions, **not verified account entitlements**.

Durable cache keys include version, endpoint, sorted parameters, schema and mode. Profile-only reports cache for seven days; financial/peer reports for 24 hours; news for one hour. Redis locks coalesce live misses. Evidence/progress expose cache dates and outcomes. Expired financial data is not silently served after an outage. Recovery can reuse evidence already persisted for that run.

Reports retain original payloads locally for JSON-pointer resolution, decimal strings, reporting years, currency/unit metadata and retrieval dates. The documented report example does not specify currency or unit: absent metadata stays unknown, produces a coverage warning, and disables monetary growth calculations. Do not infer IDR merely from an IDX ticker. Growth requires adjacent annual periods, identical known currency, unit and reporting scope, and a positive denominator.

With `LLM_ENABLED=false`, the agent uses a deterministic plan and conservative, labeled interpretations. For an actual model, configure `LLM_ENABLED=true`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY` for an HTTPS chat-completions compatible service. Plans and interpretations are validated, with three total model calls and one shared repair attempt. The model cannot supply new facts, numeric metrics, URLs, arbitrary tools, or database writes. Backend-owned claims and citations are validated before publication. Invalid model output fails explicitly.

An investigation has a 180-second deadline, 12 external requests and a per-run credit cap. Tools execute sequentially for simple MVP budgeting/recovery. Claims and final writes use lease tokens; cross-watchlist publication uses a PostgreSQL advisory lock. Duplicate queue delivery is harmless. The reconciler requeues stranded submissions and fences runs past their execution window, with at most three attempts. Persisted snapshots survive interruption. PostgreSQL is authoritative. A provider call interrupted before durable storage may need a new paid request; its original reservation stays charged.

Snapshot, evidence, revision and terminal-result history is protected by database triggers. Failed fetches never become baselines. Stable event identities suppress duplicate revisions; matching company/category/normalized subject/publication date can combine cross-source citations. Matching is conservative, not fuzzy semantic entity resolution. Publication and discovery dates remain separate. Baseline and unchanged findings are not counted as newly produced alerts.

## Approved public sources

The seed catalog contains TLKM / Telkom Indonesia, ISAT / Indosat, and EXCL / XLSMART. EXCL's merger/scope warning is preserved; historical comparability is not assumed. Official identity references are stored. Live Sectors identity/coverage remains unverified without credentials.

The starter allowlist contains official company/profile pages, not an unrestricted crawler. Selectors must be checked against live HTML before relying on coverage; an unmatched selector produces partial coverage. Customize `sources.example.json` with stable announcements, pricing pages, RSS or Atom feeds on catalog-approved domains:

```powershell
.venv/Scripts/python.exe -m app.sources sources.example.json
```

Source changes are server/admin operations. Each run freezes source settings and membership. At most two sources per company are collected. Extraction strips navigation, scripts, footer and cookie noise. A changed pricing page is an observation, not automatically a price increase; same-package quantitative comparisons are not inferred from arbitrary prose.

Fetches accept HTTPS only, validate every redirect, block local/private addresses, pin validated DNS addresses while preserving TLS verification/SNI, disable environment proxies, and cap bodies at 500 KiB. HTML requires a selector; XML uses an entity-safe parser. Retrieved text cannot change agent permissions.

## Replay and tests

`MODE=replay` explicitly selects **synthetic fixtures**, not recorded live financial results. They use fictional XTS metrics and synthetic events. Replay exercises the same normalization, persistence and evidence checks, without real credits. Baselines, signals and caches are isolated by mode.

`REPLAY_SCENARIO`: `baseline`, `changed` (one ISAT pricing-page edit), `missing_financial`, `failure` (Sectors failure), or `conflict` (contradictory price excerpts). Change the scenario, restart API/worker, and use a new request key. Synthetic metrics must not be presented as actual company data.

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/ruff.exe check app tests scripts migrations
.venv/Scripts/python.exe scripts/smoke_http.py
```

Tests use clean temporary SQLite migrations and HTTPX provider fixtures. Queue tests exercise RQ with fakeredis and an in-process test worker. Production still requires PostgreSQL and Redis.

To run the real-service integration check against local test services:

```powershell
$env:TEST_DATABASE_URL='postgresql+psycopg://rivalpulse:rivalpulse@localhost:15432/rivalpulse'
$env:TEST_REDIS_URL='redis://localhost:6379/1'
.venv/Scripts/python.exe -m pytest -m integration -q
```

This check needs permission to create/drop a temporary PostgreSQL schema. It removes only its uniquely named schema and Redis queue, without dropping the database or flushing Redis.

See [docs/verification.md](docs/verification.md) for executed checks and remaining live checks. There is no deployment, external provisioning, GitHub push, PR, or release automation.

## Documentation checked

Sectors docs were reviewed on 2026-09-22 before implementation: [v2 overview](https://docs.sectors.app/get-started/v2/overview), [report sections/credits](https://docs.sectors.app/api-references/v2/indonesia/report/company-report), [structured screener](https://docs.sectors.app/api-references/v2/indonesia/screener/companies), and [news filters/pagination](https://docs.sectors.app/api-references/v2/indonesia/news/news). These document the contract; they do not prove account access or actual coverage.
