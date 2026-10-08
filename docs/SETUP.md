# Setup and operations

## Local Windows setup

1. Install Node.js 20.9+ and Docker Desktop with its Linux engine enabled.
2. Copy `backend/.env.example` to `backend/.env` only if it does not exist. Copy `frontend/.env.example` to `frontend/.env.local` the same way.
3. Keep `AUTH_MODE=accounts`, `MODE=live`, `NEXT_PUBLIC_AUTH_MODE=accounts`, `NEXT_PUBLIC_USE_MOCKS=false`, and `NEXT_PUBLIC_API_BASE=/backend`.
4. Configure email delivery, or use the administrator provisioning command below for an explicitly provisioned private account.
5. Start Docker Desktop, then run `./START_SECTORS.ps1` from the repository root.
6. Open **http://localhost:8080** consistently for login and app use.

The startup script installs frontend dependencies if missing, starts the host Next.js development server, creates the private encryption file once, builds backend images, applies migrations, and starts PostgreSQL, Redis, API, worker, reconciler, and gateway. Existing volumes and the existing master key are retained. Startup/readiness do not verify Sectors or cloud inference.

### Verification email

Ordinary signup requires SMTP when `EMAIL_VERIFICATION_ENABLED=true`:

```dotenv
VERIFICATION_SMTP_HOST=smtp.your-provider.example
VERIFICATION_SMTP_PORT=587
VERIFICATION_SMTP_SECURITY=starttls
VERIFICATION_SMTP_USERNAME=your-smtp-user
VERIFICATION_SMTP_PASSWORD=your-private-password
VERIFICATION_EMAIL_FROM=RivalPulse <verify@your-domain.example>
```

Use your provider's real settings and authorized sender. For port 465 use `ssl`. These are server-only values. Missing delivery configuration does not justify silently disabling verification.

Signup asks for name, email, password, and optional own-company perspective. Enter the emailed eight-digit code, then log in. Profile supports display name, timezone, password changes, and verification status. Password changes revoke sessions; logout revokes access but does not cancel already authorized research.

### Administrator-provisioned account

For a private installation or access to a preserved workspace, run from `backend/`:

```powershell
docker compose exec api python -m app.accounts --email owner@example.com --name "Workspace owner" --workspace private-demo
```

Use your own email/workspace. The password is entered at hidden prompts. This is an explicit administrator operation, not ordinary signup; it does not replace an existing account or transfer research between workspaces.

## Data and AI settings

Open `/settings` as a workspace owner:

- **Sectors:** save your workspace API key, or use the administrator's shared `SECTORS_API_KEY`. Research prefers the workspace key. Removing it restores the shared-key fallback if configured. Key presence is not proof of authentication or credit balance.
- **Ollama:** install/start Ollama and a model. The server default is `qwen3.8:27b`; this large model needs substantial memory. `ollama pull qwen3.8:27b` downloads it; Settings can list installed models and select another ID.
- **OpenAI / Anthropic / Gemini:** paste an API key, optionally click Connect to list models, select a model, accept external processing/billing, then save. A consumer subscription does not establish API entitlement. Listing a model does not prove it supports every required structured-output request.
- Saving configuration sends no provider test. Cloud listing waits for a Connect click; Settings may list local Ollama models automatically. Actual inference can incur cloud charges.
- New investigations freeze model selection. Ordinary chat uses the current selection. Saved-only summaries bypass AI. Recommendations never start tools automatically.

Keys are encrypted with `backend/.env.llm-encryption`, mounted read-only into backend services. Never commit, print, or replace this master key. Retain it separately with protected database backups. An environment `LLM_KEY_ENCRYPTION_KEY` overrides the file. Linux runtime UID **10001** must have private read access to the mounted file. Windows startup applies private NTFS permissions when creating it.

## Manual startup

Use Python 3.11+ (container: 3.12). From `backend/`, before first Compose startup:

```sh
python -m venv .venv
# Windows: .venv/Scripts/python.exe; Linux/macOS: .venv/bin/python
.venv/bin/python -m pip install -e ".[test]"
.venv/bin/python scripts/init_llm_key.py
```

Protect the generated file and grant the container UID read access. Start the frontend in a separate terminal:

```sh
cd frontend
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Then, from `backend/`:

```sh
docker compose --profile frontend up --build -d
```

Use the gateway on port **8080**, not separate cross-origin browser/API URLs. Backend diagnostics are on port 8000; host PostgreSQL uses 15432 and Redis 6379. These services bind to loopback in the included manifest.

## Maintenance and troubleshooting

- Status: `docker compose -f backend/compose.yaml --profile frontend ps`.
- Logs: `docker compose -f backend/compose.yaml logs --tail 80 api worker reconciler`.
- Readiness: `/backend/api/v1/health/ready` through the gateway; `/api/v1/health/ready` directly on the API.
- Gateway 502: confirm the host frontend listens on 3000; restart `frontend-proxy` after the frontend is available.
- Registration unavailable: inspect verification SMTP, sender authorization, and registration settings.
- Model unavailable: inspect the selected model/key, provider entitlement, local-model availability, or deadline. The app does not silently switch providers.
- A saved key cannot be unlocked: restore the original master key or deliberately replace the provider key in Settings.
- Stop: `./STOP_SECTORS.ps1`. It preserves volumes and does not stop a separately running frontend/Ollama process.

Before updating an existing installation, back up PostgreSQL and the encryption master key, wait for **zero active investigations**, and disable scheduled sweeps. Apply migrations only after checking the new code. Never delete volumes, downgrade immutable history, replace the master key, or overwrite a friend's `.env` with your own. Verify existing conversations, saved evidence, and accounting after the update.

## Public deployment is a separate task

The included setup uses a host development frontend, HTTP, and local-development database credentials. Before exposing it publicly: build/run the frontend in production mode, use HTTPS with secure cookies and exact allowed origins, replace development credentials, keep data/model services private, configure backups and monitoring, test restore/migrations/account isolation, and establish account recovery/retention procedures. The gateway must retain 401 JSON responses without an HTTP Basic-auth challenge. Public provisioning, paid probes, and release promotion require explicit operator approval.
