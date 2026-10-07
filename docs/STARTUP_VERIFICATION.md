# Startup recovery and verification — 7 October 2026

## Failure and repair

The supplied log shows a successful image build followed by a Docker engine container-inspection timeout. Inspection found Redis healthy and the remaining application containers in Created state. Resuming Compose with `--parallel 1 up -d --no-build` successfully started the existing stack, without deleting containers or persistent volumes. This establishes a transient engine/startup failure; it does not identify Docker Desktop's internal cause.

`START_SECTORS.ps1` now builds once, serializes Compose engine operations, retries recognized transient startup errors up to three times with backoff, and stops immediately on other failures. It checks the frontend login HTML and API readiness through port 8080 before reporting success. It also uses a Windows PowerShell 5.1-compatible random generator when creating the initial environment and escapes apostrophes in the frontend path.

The original command was run successfully after the repair:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\START_SECTORS.ps1
```

## Executed checks

| Check | Result |
| --- | --- |
| Backend pytest suite | 174 passed; opt-in integration test skipped here and passed separately |
| Real PostgreSQL/Redis integration | 1 passed using an isolated temporary schema and queue, IPv4 loopback |
| Backend Ruff | Passed for app, tests, scripts and migrations |
| HTTP smoke script | Passed startup, migration, catalog, access gate and OpenAPI checks |
| Browser gateway authentication script | Passed: public login; protected routes return uncached 401 JSON without HTTP auth dialogs |
| Frontend ESLint | Passed |
| Frontend financial/router tests | 8 passed |
| Frontend production build | Passed, including TypeScript and generation of all 19 static pages |
| Standalone agent tests | 4 passed |
| Startup regression checks | 4 passed: success, timeout recovery, bounded retries and immediate failure for non-transient errors |
| Actual startup script | Passed build, Compose startup, proxy restart, API readiness and gateway/frontend readiness |
| Browser checks | Login and signup render; invalid credentials show the expected error; no console warnings/errors observed on login |
| Running services | API/PostgreSQL/Redis healthy; worker and reconciler running; migration and seed exited 0 |
| Database/queue probe | Current migration head, no missing required tables, database read/write works, one research worker registered |

Some initial executions were blocked by the execution sandbox's filesystem/network restrictions. The production build and backend checks were rerun with local access. Pytest reported a dependency deprecation and unwritable existing cache warnings; test assertions passed. The agent tests passed using a fresh workspace temporary directory.

## Verification limits

- `LLM_ENABLED=false` in the current configuration. Ollama was unreachable, so actual model generation was not verified; mocked/model-boundary tests passed.
- No paid Sectors research request was made. Key presence is checked, but live authorization, entitlement and external provider availability remain unverified.
- Browser checks were unauthenticated. Account activation, authenticated workspace flows, email verification and data isolation were covered by backend tests; no real verification email was sent and no user credentials were requested.
- Existing frontend edits were retained. This repair changed the startup script, its regression checks and documentation.

Open the running application at <http://localhost:8080/login>.
