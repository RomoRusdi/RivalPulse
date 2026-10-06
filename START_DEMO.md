# Start and demo RivalPulse

The normal app uses email/password accounts, a workspace per account, PostgreSQL, Redis and local Ollama. Sectors v2 is the only live financial provider. Synthetic replay is for automated tests.

## 1. Prepare the services

1. Start Docker Desktop with Linux containers.
2. Start Ollama. Install the configured model once, then check it is available:

```powershell
ollama pull qwen3.8:27b
ollama list
Invoke-RestMethod http://localhost:11434/api/tags
```

The 27B model needs substantial local memory; allow enough time for its first load.

## 2. Configure the backend

From the repository root, copy the template only if `.env` does not already exist:

```powershell
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

Edit `backend/.env` and set:

```dotenv
AUTH_MODE=accounts
REGISTRATION_ENABLED=true
EMAIL_VERIFICATION_ENABLED=true
VERIFICATION_SMTP_HOST=smtp.your-email-provider.example
VERIFICATION_SMTP_PORT=587
VERIFICATION_SMTP_SECURITY=starttls
VERIFICATION_SMTP_USERNAME=YOUR_SMTP_USERNAME
VERIFICATION_SMTP_PASSWORD=YOUR_PRIVATE_SMTP_PASSWORD
VERIFICATION_EMAIL_FROM=RivalPulse <verify@your-domain.example>
TAB_SESSION_REQUIRED=true
WORKSPACE_CREDIT_TOTAL=1000
COOKIE_SECURE=false
AUTH_ORIGINS=["http://localhost:8080","http://localhost:3000","http://localhost:8000"]
MODE=live
SECTORS_API_KEY=YOUR_PRIVATE_KEY
LLM_ENABLED=true
LLM_PLAN_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3.8:27b
```

Keep the existing database/Redis values unless you changed the published ports. Default host PostgreSQL is `localhost:15432`; containers use `postgres:5432`. A database port change affects a host-side `DATABASE_URL`, not the website port. Compose routes Ollama to `host.docker.internal:11434`.

Never put the Sectors key or any password into frontend variables. A demo access token is not needed in accounts mode. For HTTPS deployment, set `COOKIE_SECURE=true` and use your exact HTTPS origins.

Use your mail provider's SMTP settings and an authorized sender address. The values above are placeholders; new accounts cannot be created until delivery is configured. Port 587 uses `starttls`; a provider that requires port 465 uses `VERIFICATION_SMTP_SECURITY=ssl`. Both modes validate TLS certificates. Verification email settings are separate from optional research alert delivery.

## 3. Configure the frontend

Set `frontend/.env.local` to:

```dotenv
NEXT_PUBLIC_AUTH_MODE=accounts
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=/backend
```

The startup script creates this file if absent. Restart Next.js after changing public environment variables.

## 4. Start the app

```powershell
.\START_SECTORS.ps1
```

This starts the frontend on port 3000, builds the backend, applies the merged migrations, seeds the catalog, starts API/worker/reconciler, and publishes the same-origin proxy on port 8080. Existing database volumes are retained. The script checks key presence; it does not verify Sectors authorization or spend credits.

Open `http://localhost:8080/signup`. Enter your name, a real email, a password of 15–128 characters, and an optional company (Neutral is available). Enter the eight-digit code from your inbox, then log in. Codes expire after 15 minutes; resend is available after one minute. The reconciler removes pending registrations after 24 hours. Unconfirmed registrations never create an active account or workspace.

After updating this version, rerun the startup script so Compose rebuilds and applies migration `20261006_account_quality`. Existing accounts, passwords and workspace data are preserved. Existing users can confirm their email from Profile.

## 5. Demo the account and AI workflow

1. Confirm your name appears in the account menu.
2. Visit `/profile`, edit display name and timezone, save, and reload. Check the email verification status; email is read-only.
3. Return to `/` and send `Hello RivalPulse`. This calls local Ollama without creating a research run or spending Sectors credits. If the model is unavailable, the reply is labeled as a fallback.
4. Ask `Show me who is currently in my competitor watchlist.` This is an instant workspace command.
5. Ask `Compare annual revenue and earnings for ISAT and TLKM`. This queues a research run, uses bounded Sectors calls and local AI, then displays cited results or an explicit failure. A live investigation can spend credits.
6. Reload and open History to confirm the conversation and completed research remain saved.
7. Sign out, then log in again. Your profile, watchlist and history remain in your workspace.
8. To check isolation, create a second test account. It receives its own starter watchlist and cannot see the first account's conversations or research.
9. Visit Competitors, open Revenue data and sources, then choose View financial data. This opens stored evidence inside your workspace without calling Sectors again or requiring a browser API key. Unknown currency, units or reporting scope remain explicit; growth is shown only for comparable figures.
10. Open History. The drawer slides independently, keeps keyboard focus inside, and closes with Escape. Open a company or date dropdown and try arrow keys, Enter and Escape.

Research remaining shows the percentage of usable workspace research credits. These are Sectors request credits, not AI model tokens. Availability also respects the shared provider reserve, so a new workspace can start below 100%. Configure `WORKSPACE_CREDIT_TOTAL`, `CREDIT_TOTAL` and `CREDIT_RESERVE` to match the allowance you intend to provide; these values do not automatically synchronize with Sectors billing.

With Keep me signed in unchecked, refresh and navigation work in the current tab; opening a fresh tab after closing it requires login. With the box checked, the session cookie lasts up to 30 days, subject to server expiry and inactivity limits. Browser restore features can restore a closed tab's session storage; closing a page is not a reliable signal for immediate server revocation. Use Sign out to revoke access immediately.

Logout revokes access and closes browser requests/streams. An already queued research job continues in its owning workspace and is available after login. Password changes revoke all account sessions and require login again.

## 6. Check database, queue and AI connections

```powershell
Set-Location backend
docker compose ps
docker compose exec api python scripts/check_connections.py --probe-ai
docker compose logs --tail 80 api worker reconciler
```

The probe checks database read/write and migration state, Redis and workers, installed Ollama model, and a synthetic structured AI response. It does not call Sectors. If the image lacks the script, rebuild first with `docker compose up --build -d`.

For a 502 at port 8080, confirm the frontend listens on port 3000 and the API on port 8000, then run `docker compose --profile frontend restart frontend-proxy`. Use port 8080 consistently for browser login; mixing `localhost` and `127.0.0.1` can change cookie/origin behavior.

If Chrome shows its own username/password popup, cancel it and rebuild the API and reload the proxy after updating the code. From the repository root, rerun `.\START_SECTORS.ps1`. Account authentication uses the application's login form; signed-out and expired sessions return HTTP 401 JSON without an HTTP Basic challenge. The proxy also suppresses upstream authentication challenges while preserving access checks.

Check this behavior without logging in or calling Sectors, from `backend/`:

```powershell
.venv/Scripts/python.exe scripts/check_browser_auth.py --base-url http://localhost:8080
```

The check requires a public HTML login page and protected account responses that remain HTTP 401 JSON with no authentication challenge. It exits with a failure if the gateway changes that behavior.

## 7. Access the preserved shared workspace

New registrations do not inherit old shared demo data. To create a new owner account for the preserved workspace, run this once from `backend/`:

```powershell
docker compose exec api python -m app.accounts --email owner@example.com --name "Workspace owner" --workspace private-demo
```

Enter the new password at the hidden prompts. Use your real email and the old `WORKSPACE_ID` if different. This never changes an existing account or moves research between workspaces.

## 8. Stop

```powershell
Set-Location ..
.\STOP_SECTORS.ps1
```

Database and Redis volumes remain. Do not use `docker compose down --volumes` if you want to keep account and research data. The old Yahoo startup script is retired because the current agent supports Sectors live mode only.
