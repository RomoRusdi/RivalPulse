# RivalPulse backend

FastAPI, SQLAlchemy/Alembic, PostgreSQL, Redis/RQ, HTTPX, and an explicit Python research agent.

Workflow: enter a chat message in English or Bahasa Indonesia → run workspace commands instantly, answer conversation through `/api/v1/chat` (no provider calls, no credits), or — only for research intent such as a research verb, a named company, or a market topic about competitors — queue an analytical investigation → collect Sectors v2 financial data and approved public evidence → compare successful baselines → validate cited findings → publish immutable revisions. Conversation transcripts are stored per workspace in PostgreSQL. Sectors is the only live financial provider; synthetic replay is restricted to automated tests. Repeating identical evidence produces no new revision or alert. First observations are labeled `baseline`.

## Start with Docker Compose

Run from this directory. Docker Desktop with Linux containers is required.

```powershell
Copy-Item .env.example .env
# Edit .env: AUTH_MODE=accounts, approved AUTH_ORIGINS, local Ollama settings.
# Set SECTORS_API_KEY in this ignored file. MODE=live is enforced by Compose.
docker compose up --build -d
docker compose logs -f api worker reconciler
```

Compose waits for PostgreSQL and Redis, runs migrations, seeds three companies and a watchlist, then starts the API, RQ worker, and reconciler. Data persists in named volumes. Services bind to loopback. Stop with `docker compose down`; omit `--volumes` to retain history.

- Interactive contracts: [http://localhost:8000/docs](http://localhost:8000/docs). Normal access uses account cookies and CSRF; the bearer token is for explicit demo mode only.
- Liveness: `GET /api/v1/health/live`.
- Readiness: `GET /api/v1/health/ready` checks the merged migrations, database, Redis, access configuration, and the presence (not validity) of a Sectors key. Use `scripts/check_connections.py --probe-ai` for model generation checks.
- `MODE=live` is enforced by Compose. Missing Sectors credentials reject investigations before queueing; failed live requests never fall back to replay. A configured but invalid key will fail with `PROVIDER_AUTH_FAILED` when a live request is made.

### Windows startup

From the repository root, run `./START_SECTORS.ps1` after setting a valid `SECTORS_API_KEY` and `AUTH_MODE=accounts` in ignored `backend/.env`. The script starts the same-origin frontend proxy at `http://localhost:8080`; stop it with `./STOP_SECTORS.ps1` (volumes are retained). It checks key presence without making a billable provider request. Set `NEXT_PUBLIC_AUTH_MODE=accounts`, `NEXT_PUBLIC_USE_MOCKS=false` and `NEXT_PUBLIC_API_BASE=/backend` in the frontend's ignored `.env.local`. See [../START_DEMO.md](../START_DEMO.md).

Existing test-mode history in the database is preserved as an archive, but it cannot become a live baseline or be used for new requests.

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

Find IDs with `GET /api/v1/companies?query=ISAT`. Watchlists require 2–5 distinct catalog companies. Workspace identity comes from the authenticated membership in accounts mode; client-supplied workspace fields are rejected.

## API contracts and frontend integration

Versioned endpoints cover company search; watchlist create/list/detail/edit; research submission/status/history; signal list/detail/revisions; conversation (`POST /api/v1/chat`, which never calls Sectors or creates a run); and health. Lists use `{ "items": [], "next_cursor": null }`. Signal filters include `watchlist_id`, `severity`, and `mode`. Research submission returns **202**, `id`, `mode`, `status`, and `status_url`. Errors contain `code`, `message`, `retryable`, and `request_id`.

- [docs/openapi.json](docs/openapi.json): canonical typed OpenAPI contract.
- [docs/examples.json](docs/examples.json): actual synthetic replay output, including a completed run, evidence, signal detail, and frontend dashboard.
- `python scripts/export_contracts.py`: regenerate both from a clean, migrated temporary database.

The existing frontend's `schemas.ts` is supported by `GET /dashboard`, `GET /signals/{id}`, `POST /runs`, `GET /runs/{id}/stream` (SSE), and `POST /runs/{id}/cancel`. Canonical terminal success states map to the legacy frontend's `complete`; partial coverage remains explicit in the summary and `coverageStatus`. Replay appears in titles and summaries because the legacy frontend schema discards extra fields. The canonical API retains full citation metadata.

The frontend sends cookie credentials and CSRF tokens through one authenticated transport. Use the included **same-origin proxy**, with the frontend development server on port 3000:

```dotenv
# frontend/.env.local
NEXT_PUBLIC_AUTH_MODE=accounts
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=/backend
```

```powershell
docker compose --profile frontend up -d frontend-proxy
```

Open [http://localhost:8080/signup](http://localhost:8080/signup) to create an account, then use [http://localhost:8080/login](http://localhost:8080/login). The app checks `/api/v1/auth/me` before loading the workspace; profile edits and conversations persist in PostgreSQL. The `/backend/` prefix avoids frontend/API route collisions. Restart the frontend after changing its environment. New accounts have isolated starter workspaces; assign an owner to preserved shared data only through `python -m app.accounts` as documented in the startup guide.

Registration requires email ownership verification by default. Configure `VERIFICATION_SMTP_HOST`, `VERIFICATION_SMTP_PORT`, `VERIFICATION_SMTP_SECURITY` (`starttls` or `ssl`), `VERIFICATION_SMTP_USERNAME`, `VERIFICATION_SMTP_PASSWORD` and `VERIFICATION_EMAIL_FROM` in the ignored backend `.env`. Delivery failure creates no active account. Challenges use hashed eight-digit codes, a 15-minute code lifetime, five failed attempts, a one-minute resend cooldown and a 24-hour pending registration lifetime. The reconciler purges expired pending records. Existing accounts are retained and can verify through Profile; invalid email format is rejected at input, and active accounts are never deleted based on an unproven deliverability guess.

Unchecked Keep me signed in sessions require `X-Tab-Session` in addition to cookies. The proof is returned only at login, hashed on the server, and stored in the browser's session storage. All authenticated HTTP and research stream requests carry it. Existing sessions are grandfathered, and remembered logins use cookies without a tab proof. Freshly reopening a closed tab requires login for temporary sessions; browser session restore can restore storage. Explicit logout revokes server access.

Separate account clients must retain session cookies, get `/api/v1/auth/csrf`, and send its token in `X-CSRF-Token` plus an approved `Origin` for mutations. Bearer/Basic token access remains only in explicit `AUTH_MODE=demo`; it does not bypass account authentication. Do not put tokens or provider keys into `NEXT_PUBLIC_*` variables.

## Providers, agent, and evidence

Sectors v2 uses server-side credentials and explicit report sections. The default run requests `overview,financials` for each company (two credits per cold report). Optional peer, bounded news, and structured screener adapters are available; default public signals come directly from approved official pages. Each retry reserves credits because unsuccessful requests may still be billed. Shared and per-run spend are reserved atomically in PostgreSQL; unknown outcomes remain charged. `CREDIT_TOTAL=1000` and a 200-credit reserve are configurable assumptions, **not verified account entitlements**.

Workspace quotas are reserved in the same transaction as global and per-run spend. `WORKSPACE_CREDIT_TOTAL` sets new workspace allowances; the migration backfills existing workspaces with a 1,000-credit allowance and historical research spend. The dashboard's remaining percentage is usable workspace research credits capped by the shared provider reserve, not Ollama tokens. `GET /api/v1/financial-sources/{snapshot_id}` provides a normalized stored annual revenue view after checking workspace ownership and data mode; it never forwards the provider key or makes another paid request.

Durable cache keys include version, endpoint, sorted parameters, schema and mode. Profile-only reports cache for seven days; financial/peer reports for 24 hours; news for one hour. Redis locks coalesce live misses. Evidence/progress expose cache dates and outcomes. Expired financial data is not silently served after an outage. Recovery can reuse evidence already persisted for that run.

Reports retain original payloads locally for JSON-pointer resolution, decimal strings, reporting years, currency/unit metadata and retrieval dates. The documented report example does not specify currency or unit: absent metadata stays unknown, produces a coverage warning, and disables monetary growth calculations. Do not infer IDR merely from an IDX ticker. Growth requires adjacent annual periods, identical known currency, unit and reporting scope, and a positive denominator.

With `LLM_ENABLED=false`, the agent uses a deterministic plan and conservative, labeled interpretations. Live Sectors tool planning starts deterministic (`LLM_PLAN_ENABLED=false`) to protect credits; Qwen `qwen3.8:27b` can still interpret bounded, cited evidence. After a valid key and credit/latency usage are verified, bounded Qwen planning may be enabled explicitly. Multi-company tool requests are split into single-company calls. An invalid model plan receives one repair attempt before a visibly recorded, validated deterministic fallback; model outages still fail explicitly. Docker Compose routes worker calls to host Ollama through `host.docker.internal`. Annual financial questions receive a cited Sectors statement brief even without public-page events. Qwen adds an optional claim-linked, nonnumeric interpretation; if it cannot be validated, cited figures remain available with a caveat. Weekly activity questions still require verifiable public evidence. The model cannot supply numeric metrics, URLs, arbitrary tools, or database writes.

A live Compose investigation has a 360-second deadline, 12 external requests and a per-run credit cap. Tools execute sequentially for simple MVP budgeting/recovery. Claims and final writes use lease tokens; cross-watchlist publication uses a PostgreSQL advisory lock. Duplicate queue delivery is harmless. The reconciler requeues stranded submissions and fences runs past their execution window, with at most three attempts. Persisted snapshots survive interruption. PostgreSQL is authoritative. A provider call interrupted before durable storage may need a new paid request; its original reservation stays charged.

Snapshot, evidence, revision and terminal-result history is protected by database triggers. Failed fetches never become baselines. Stable event identities suppress duplicate revisions; matching company/category/normalized subject/publication date can combine cross-source citations. Matching is conservative, not fuzzy semantic entity resolution. Publication and discovery dates remain separate. Baseline and unchanged findings are not counted as newly produced alerts.

## Important-change Gmail alerts

Optional Gmail delivery is server-configured with `ALERTS_ENABLED`, `ALERT_EMAIL_TO`, `GMAIL_ADDRESS`, and a Google `GMAIL_APP_PASSWORD`. The worker sends at most one plain-text digest after a completed run, only for newly published `new` or `updated` findings at or above `ALERT_MIN_SEVERITY`. Baselines and unchanged findings are suppressed, multiple findings are grouped, credentials never reach the browser, and an SMTP failure never invalidates stored research. `GET /api/v1/alerts/status` exposes only masked configuration state.

## Approved public sources

The seed catalog contains TLKM / Telkom Indonesia, ISAT / Indosat, and EXCL / XLSMART. EXCL's merger/scope warning is preserved; historical comparability is not assumed. Official identity references are stored. Live Sectors identity/coverage remains unverified without credentials.

The starter allowlist contains official company/profile pages, not an unrestricted crawler. Selectors must be checked against live HTML before relying on coverage; an unmatched selector produces partial coverage. Customize `sources.example.json` with stable announcements, pricing pages, RSS or Atom feeds on catalog-approved domains:

```powershell
.venv/Scripts/python.exe -m app.sources sources.example.json
```

Source changes are server/admin operations. Each run freezes source settings and membership. At most two sources per company are collected. Extraction strips navigation, scripts, footer and cookie noise. A changed pricing page is an observation, not automatically a price increase; same-package quantitative comparisons are not inferred from arbitrary prose.

Fetches accept HTTPS only, validate every redirect, block local/private addresses, pin validated DNS addresses while preserving TLS verification/SNI, disable environment proxies, and cap bodies at 500 KiB. HTML requires a selector; XML uses an entity-safe parser. Retrieved text cannot change agent permissions.

## Tests

`MODE=replay` is retained only for deterministic automated tests. It uses fictional XTS metrics and synthetic events to exercise normalization, persistence, evidence checks, and failure paths without network dependencies. It is not the website testing mode and has no Compose startup override.

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
