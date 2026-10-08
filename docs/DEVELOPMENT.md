# Development and handoff

## Checks

Backend tests use temporary databases, synthetic replay, mocked HTTP, and fake Redis. They do not establish live Sectors/cloud entitlement. Integration tests need separately configured PostgreSQL/Redis and are skipped from normal CI.

```powershell
# From backend/, after installing .[test] in .venv:
.venv/Scripts/python.exe -m pytest -q -m "not integration"
.venv/Scripts/ruff.exe check app tests scripts migrations

# From frontend/:
npm ci
npm test
npm run lint
npm run build

# From the repository root:
python scripts/check_repository.py
powershell.exe -NoProfile -File scripts/test_startup.ps1
```

On Linux/macOS use `.venv/bin/` instead of `.venv/Scripts/`. Startup regression tests mock Docker; they do not start services or read `.env`. GitHub Actions runs these checks on each push/pull request without provider credentials.

Do not confuse unit/build success with a verified working key, rendered-browser accessibility check, production deployment, or live provider success. A paid connection test/fresh investigation requires explicit authorization. Review desktop/mobile layout, keyboard interactions, overflow, loading/error states, and exported files before a release.

## Code map

| Area | Key files |
| --- | --- |
| Research orchestration | `backend/app/agent.py`, `research.py`, `service.py`, `jobs.py` |
| Provider evidence | `providers.py`, `public_sources.py`, `public_evidence.py`, `semantic_events.py` |
| Financial delivery | `financial_feed.py`, `financial_projection.py`, `brief_projection.py`, `comparison.py` |
| Finding delivery | `finding_feed.py`, `finding_projection.py`, `decision_support.py`, `compat.py` |
| Access/settings | `auth.py`, `accounts.py`, `email_verification.py`, `llm_settings.py`, `data_keys.py` |
| Frontend contracts/transport | `frontend/src/lib/schemas.ts`, `types.ts`, `http.ts`, `api.ts` |
| Conversation/routing | `components/agent/AgentWorkspace.tsx`, `lib/agent-router.ts`, `lib/chat-history.ts` |
| Financial/XLS formatting | `lib/financial-display.ts`, `lib/export-xls.ts`, `lib/sector-groups.ts` |

Read `frontend/AGENTS.md` and the installed Next.js documentation before changing App Router code. Keep source/security comments that explain constraints; remove dead code instead of deleting all comments. Demo/replay adapters and old-record projections remain because tests and saved archives use them.

## API contracts and utilities

FastAPI serves current OpenAPI at **http://localhost:8000/docs** and `/openapi.json`. Backend Pydantic contracts are in `app/contracts.py`; browser responses are validated with `frontend/src/lib/schemas.ts`. The browser gateway sends `/backend/` requests to the API with the prefix removed. Saved API endpoints enforce workspace ownership and do not refetch evidence.

- `backend/scripts/export_contracts.py`: regenerate ignored `backend/docs/openapi.json` and synthetic examples from a temporary replay database; generated snapshots are not the source of truth.
- `backend/scripts/check_browser_auth.py`: check an explicitly selected running gateway's login/401 behavior without credentials or provider calls.
- `backend/scripts/check_connections.py`: diagnose local database/Redis/Ollama; `--probe-ai` explicitly generates a synthetic **local** model response. It is not a workspace cloud connection test.
- `backend/scripts/init_llm_key.py`: create/validate private encryption storage without printing or overwriting its contents.
- `backend/scripts/reclassify_findings.py`: explicit workspace-scoped archive maintenance, dry-run by default. Do not run `--apply` as part of normal startup or release checks.
- `backend/scripts/smoke_http.py`: isolated replay HTTP smoke check.

## Replacing another checkout safely

1. Review the diff and run checks; make sure all new app modules, migrations, and templates are included.
2. Never copy a developer's `.env`, frontend `.env.local`, credentials, test accounts, or encryption master key into Git or another installation.
3. Back up the target database **and its existing master key**. Preserve database/Redis volumes. A code checkout alone does not migrate or transfer users/research.
4. Drain investigations and keep scheduled sweeps off before rebuilding/migrating. Keep the full migration chain; do not squash it or reset the database.
5. Use the target installation's configuration and keys, run the approved migration/startup, then check readiness, login, workspace isolation, saved research/conversations, exports, and accounting.
6. Review unresolved accuracy/deployment caveats in [Architecture](ARCHITECTURE.md). Repository cleanup does not resolve them or authorize a public launch.
7. Commit/push or merge into `main` only after explicit review. Do not force-push over a friend's work or overwrite their branch history.

The cleanup archive is local and outside the repository; it is not part of the app or release. Older commits and any existing Git stash remain intact.
