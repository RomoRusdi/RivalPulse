# RivalPulse deployment plan

Prepared 6 October 2026. This is an implementation and release plan; it does not deploy the application.

## Release approach

Start with an administrator-provisioned private beta on one Linux container host. Keep registration closed until recovery, abuse controls, and capacity limits are ready. Use a single HTTPS origin for the website and API. Add public registration only after the gates below pass.

The current Windows/Docker setup is suitable for local demos. It depends on a frontend process on the host, uses HTTP and development database credentials, and has no production frontend image, TLS configuration, backup automation, or release workflow. UI polish does not resolve those infrastructure gaps.

Decisions before provisioning: hosting provider, domain, expected concurrent users, monthly infrastructure/provider budget, data retention, operations owner, and whether production includes local AI. The recommended starting architecture is a proposal based on this repository, not a capacity guarantee.

## Target architecture

| Service | Exposure | Responsibilities |
| --- | --- | --- |
| HTTPS gateway | Public ports 443 and redirect-only 80 | TLS, same-origin routing, request limits, streaming, access logging |
| Next.js frontend | Private network | Production build of the existing UI |
| FastAPI API | Private network | Authentication, workspace access, research submission, event streams |
| RQ worker | Private network | Research execution; begin with one worker and measure capacity |
| Reconciler | Private network | Recover interrupted or expired jobs; preserve existing execution fences |
| PostgreSQL | Private network | Accounts, sessions, workspace data, research, conversation history |
| Redis | Private network | Queue, authentication throttling, cache, AI chat coordination |
| Ollama, if AI enabled | Private network or VPN | Installed model and sufficient GPU/RAM for measured workloads |

Route website requests to the frontend and `/backend/` to the API with the prefix removed. Preserve the public host and trusted forwarded protocol information. Do not expose PostgreSQL, Redis, API, Node.js, or Ollama ports to the Internet. Deploy the frontend behind a reverse proxy and verify streaming through every intermediary. [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

Terminate HTTPS at the gateway. Configure trusted proxy headers only for the gateway's addresses and confirm secure cookies on the real domain. [FastAPI HTTPS deployment](https://fastapi.tiangolo.com/deployment/https/)

Use RivalPulse's cookie-based account login at the browser gateway. Carry `proxy_hide_header WWW-Authenticate;` from `backend/nginx.conf` into the production `/backend/` location. This removes upstream HTTP authentication challenges while retaining the API's 401 status and JSON response. Do not convert authentication failures to successful responses or an HTML gateway error page. Do not configure `auth_basic` on the application or its login/API routes. [Nginx response header handling](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_hide_header)

Point production containers at a private Ollama address instead of the current Windows `host.docker.internal` default. Determine the bind address for that private connection and keep network access restricted. [Ollama networking](https://docs.ollama.com/faq#how-can-i-expose-ollama-on-my-network)

## Phase 1 — Product and access gates

Owner: application engineer and product owner.

- Keep the professional UI completed in this sweep: concise research notifications, retained coverage warnings, no credential instructions in Alerts, truthful delivery states, useful empty/error states, and evidence-based action guidance.
- Verify signup, login, logout, profile/password changes, account switching, and cross-workspace isolation on staging.
- For the private beta, set `REGISTRATION_ENABLED=false` and provision accounts through the existing administrator workflow. Document a secure support/recovery process.
- Before public registration, implement verified email ownership, password recovery, registration abuse controls, and an account deletion/retention policy. These are release requirements, not features supplied by this UI update.
- Add workspace-owned notification recipients and preferences before offering self-service email. Current Gmail configuration belongs to the preserved workspace; newly registered workspaces report email off. Never remove that isolation to make the UI appear active.
- Keep scheduled sweeps unavailable in account mode until workspace-specific scheduling, ownership, concurrency, and spend controls exist.
- Establish account/workspace quotas. The current credit allowance is shared by the application, not a per-customer billing balance.
- Coordinate capacity across chat and research before increasing worker count. The existing chat lock does not impose one shared limit on every research model call.

Exit gate: the beta feature list states exactly what is available; product copy and actual authorization match.

## Phase 2 — Production packaging and configuration

Owner: application engineer and infrastructure owner.

Proposed artifacts to implement next:

| Artifact | Required behavior |
| --- | --- |
| `frontend/Dockerfile` | Locked install, production build, non-root runtime, bundled assets, no local environment files |
| `frontend/.dockerignore` | Exclude dependencies, build cache, private environment files, test artifacts |
| `backend/compose.production.yaml` or a standalone production manifest | Immutable image tags/digests, private services, runtime configuration, persistent volumes, resource/restart policies |
| `backend/nginx.production.conf` | HTTPS routing, trusted headers, SSE without buffering, appropriate stream timeout, security headers |
| `backend/.env.production.example` | Variable names and non-secret examples only |
| CI workflow | Frontend lint/build, backend Ruff/tests/migration checks, dependency/container checks, image publishing |

Production overrides must be reviewed as a resolved manifest: Compose merges can retain development ports and environments. Confirm that the hardcoded database URL, local AI address, and development credentials do not survive. [Docker production guidance](https://docs.docker.com/compose/how-tos/production/)

Required configuration:

| Setting | Production requirement |
| --- | --- |
| `AUTH_MODE` | `accounts` |
| `MODE` | `live`; no replay fixtures |
| `COOKIE_SECURE` | `true` over HTTPS |
| `AUTH_ORIGINS`, `CORS_ORIGINS` | Exact approved HTTPS origins; no wildcard or localhost |
| `APP_BASE_URL` | Public HTTPS application origin |
| `REGISTRATION_ENABLED` | `false` for the initial private beta |
| `DATABASE_URL`, `REDIS_URL` | Private authenticated services with unique credentials |
| `SECTORS_API_KEY` | Runtime secret; never frontend/build input |
| `LLM_ENABLED`, `LLM_PLAN_ENABLED` | Explicit decision: both false for deterministic research, or provision and verify AI |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Private endpoint and verified installed model when AI is enabled |
| `ALERTS_ENABLED`, `SCHEDULED_SWEEP_ENABLED` | Off until the applicable delivery/scheduling gates pass |
| Credit/tool/run limits | Measured limits matching the agreed spend and latency budget |
| Frontend `NEXT_PUBLIC_AUTH_MODE` | `accounts` |
| Frontend `NEXT_PUBLIC_USE_MOCKS` | `false` |
| Frontend `NEXT_PUBLIC_API_BASE` | `/backend` |

Frontend public variables are build inputs. Build them into the release image; changing the runtime environment alone will not change browser configuration.

Use the hosting secret store to inject runtime values. The app currently reads environment settings; simply mounting Docker secret files does not make it read them. If file-based secrets are selected, implement and test settings support first. Limit each service's access to the secrets it needs. [Docker Compose secrets](https://docs.docker.com/reference/compose-file/secrets/)

Exit gate: clean reproducible images run without the developer's filesystem or environment files.

## Phase 3 — Database, queue, and recovery

Owner: infrastructure owner and application engineer.

1. Provision separate staging and production databases, Redis instances, and credentials. Never reuse the local replay preview database.
2. Configure durable PostgreSQL storage and Redis persistence/no-eviction behavior; confirm disk and memory alerts.
3. Back up before migration. Run `alembic upgrade head` once as a release job, followed by the required catalog seed. Do not treat a live schema migration as an automatic action by every application replica.
4. Start API, worker, and reconciler only after schema/catalog checks pass.
5. Implement encrypted off-host backups with a documented retention policy. Proposed beta objectives: recovery point within 24 hours and recovery within 4 hours; obtain owner agreement before launch.
6. Restore into an isolated environment and prove that accounts, watchlists, conversations, and completed research remain usable. Database volumes alone are not a backup.
7. If recovery must be more granular than logical backups allow, configure PostgreSQL base backups and WAL archiving, then test point-in-time recovery. [PostgreSQL backup and restore](https://www.postgresql.org/docs/16/backup.html)

Exit gate: an actual restore drill meets the approved recovery objectives.

## Phase 4 — Staging verification

Owner: application engineer and release reviewer.

- Run frontend lint and production build; backend Ruff and the full test suite. Run database migrations and isolation/recovery tests against PostgreSQL, not only SQLite.
- Check readiness at `/api/v1/health/ready` through the gateway. Readiness checks configuration/dependencies; it does not prove a provider key is valid or that a model can answer.
- Run `python scripts/check_connections.py --probe-ai` inside the API environment when AI is enabled; omit `--probe-ai` when AI is disabled. This script checks database read/write, migration state, Redis/workers, and synthetic model generation without calling Sectors.
- Run one explicitly budgeted live Sectors investigation with valid sources. Record credits, evidence links, completeness, timing, and final state. Do not infer live connectivity from replay success.
- Test two separate accounts: profile, watchlist, conversation, run IDs, cancellation, and stream endpoints must remain isolated.
- Check HTTPS session cookies, CSRF rejection, disallowed origins, expiration, logout, and stale-tab behavior.
- Run `python scripts/check_browser_auth.py --base-url https://YOUR_APPLICATION_DOMAIN` from the backend environment against staging and the promoted release. It uses no credentials or provider calls and fails if the login page is blocked, account APIs stop returning 401 JSON, or the gateway adds an HTTP authentication challenge. Then verify a fresh browser and an expired session reach the app login page without a native username/password dialog; a wrong password must stay within the app form.
- Verify that event streams update incrementally through the real gateway, including disconnect/reconnect and navigation during a run.
- Verify that Stop reports success only after cancellation is confirmed. Test request rejection, timeout, provider outage, partial coverage, no findings, and data-service unavailability.
- Review all primary routes at desktop and mobile sizes, keyboard navigation, focus visibility, readable contrast, and reduced-motion behavior.
- Confirm that pages and browser bundles contain no provider keys, Gmail credentials, environment instructions, raw server exceptions, or active demo controls. Password entry fields remain part of account management.
- Check the gateway request limit against real conversation payloads. The current local gateway allows 32 KiB; ensure users receive a readable message for oversized requests.
- Test the selected AI model under the expected concurrent chat/research load. Do not enable extra workers until latency, memory, and credit limits remain acceptable.

Exit gate: record evidence of every check and resolve release-blocking failures.

## Phase 5 — Operations and release

Owner: operations owner and release reviewer.

- Collect structured logs with request/run references; redact secrets, session cookies, authorization headers, and sensitive prompt content.
- Monitor gateway/API errors, readiness, queue age/depth, worker heartbeat, reconciler errors, research failures/partial coverage, provider credits, cache reuse, AI latency/capacity, disk/memory, certificate expiry, and backup success.
- Assign alert recipients and thresholds based on staging measurements. Proposed beta triggers: repeated readiness failure, unavailable worker, stuck jobs beyond the run timeout/recovery interval, unexpected credit growth, and failed backups.
- Pin release images to a reviewed commit and retain the previous compatible images. Promotion should reuse the staging-tested images.
- Pause new investigations during incompatible maintenance; drain active jobs rather than terminating them mid-provider request. Verify cancellation/reconciliation and credit reservations after a restart.
- Apply the approved migration, restart services in dependency order, then run authentication, workspace isolation, streaming, and one bounded research smoke check.
- Admit the first beta users only after the release reviewer approves the recorded checks. Provisioning, domain changes, email enablement, publishing, and paid provider probes are separate deployment actions.

Exit gate: monitored HTTPS application with a named operator, tested backups, and an approved beta cohort.

## Rollback procedure

1. Stop new research submissions and preserve logs and run/credit records.
2. Restore the previous image versions only when they are compatible with the current database schema.
3. Prefer a forward corrective migration. Do not automatically downgrade or reset a database containing user data.
4. Use a verified backup restore only for a recovery incident, with an agreed data-loss window and maintenance period.
5. Reconcile interrupted jobs and credit reservations before accepting new investigations. Restoring local records does not undo Sectors requests or charges.
6. Recheck login, isolation, queue health, and live updates before reopening access.

## Current verification

Completed locally on 6 October 2026:

- Frontend ESLint passed.
- Production build and TypeScript checks passed; 19 routes generated.
- Browser checks used account authentication, SQLite, fake Redis, replay providers, and disabled AI/email. No real provider requests or emails were sent.
- Verified login branding, Alerts off/unavailable/retry, a 390 × 844 mobile layout without page overflow, settings, research usage outage/recovery, action suggestions linked to evidence, competitor controls, partial research completion, expandable coverage gaps, and rejection of research submission without a stuck preparation state.
- Confirmed public error messages suppress synthetic credential/setup details and keep the reason in the conversation.
- Removed static sample run history from live search; account-mode demo controls and reset query parameters are disabled.
- Source scan found no Gmail/Sectors/Ollama setup variable names, worker-log commands, or the obsolete instant-action badge in frontend source.
- Private environment files and preview data/screenshots remain ignored by Git. No push, deployment, or backend changes were made in this UI sweep.

These checks do not validate live PostgreSQL, Redis, Ollama, Gmail, Sectors credentials, or a public HTTPS deployment. Live integration, cancellation/reconnect under infrastructure failure, load testing, restore drills, and the complete production security checks remain release gates.

### Browser authentication fix — 6 October 2026

- Account authentication failures preserve HTTP 401 JSON and omit `WWW-Authenticate`. Signed-out, invalid-cookie, revoked-session, expired-session, invalid-password, and stream-access regressions cover the application login flow. Explicit demo API challenges use Bearer; existing demo credential validation remains intact.
- The full backend suite passed: 151 tests passed and one infrastructure integration test was skipped. Ruff passed for the changed Python files. Nginx configuration validation passed.
- Tested the actual browser proxy configuration against an isolated upstream deliberately returning HTTP 401 with an HTTP Basic challenge. The proxy retained the status and JSON, removed the challenge, and the existing frontend redirected `/` to `/login?returnTo=%2F` without a native browser prompt.
- The release check passed against that gateway and failed against the challenge-emitting upstream. It also has regressions for blocked login pages, redirects, HTML API errors, unexpectedly public APIs, cached authentication errors, and credential-containing origin URLs.

These were isolated checks using synthetic responses; they did not start the main application stack, modify user data, call Sectors, or validate a public HTTPS release. Rebuild the API and reload the browser gateway when installing this fix. Carry the header suppression and signed-out checks into the eventual production gateway.
