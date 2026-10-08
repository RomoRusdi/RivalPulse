# RivalPulse

**Evidence-backed competitor intelligence for Indonesian public companies.**

Ask a question in English or Bahasa Indonesia, compare tracked companies, and review what changed—with saved source evidence, financial context, and clearly separated AI interpretation.

## What it does

- Tracks **2–5 competitors**, with an independent optional own-company perspective.
- Collects company reports and news from **Sectors v2**, plus administrator-approved public pages.
- Runs bounded investigations with progress, cancellation, coverage warnings, and cited results.
- Explains **what happened, why it matters, possible implications, and suggested next steps**. Suggestions do not execute automatically.
- Saves accounts, watchlists, conversations, research, and immutable evidence in PostgreSQL.
- Exports investigation results to **Excel-compatible `.xls`** and individual findings to text. Exports retain the question, figures, interpretations, and notes/limitations.
- Supports **Local Ollama, OpenAI, Anthropic, and Gemini** through owner-managed workspace settings. Workspace Sectors and cloud-model keys are encrypted server-side.

## Quick start · Windows

**Requirements:** Docker Desktop (Linux containers), Node.js 20.9+, and a Sectors API key for live research. Local AI additionally needs Ollama and an installed model; cloud AI needs the selected provider's API key. Python 3.11+ is needed only for local backend development/tests.

```powershell
# From the repository root; do not overwrite existing configuration.
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (-not (Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }

# Configure verification SMTP in backend/.env for ordinary signup.
# Optionally set a shared SECTORS_API_KEY, or add your workspace key in Settings.
.\START_SECTORS.ps1
```

Open **http://localhost:8080**. Sign up and verify your email, or log in to an existing account. In **Settings**, configure your Sectors connection and AI provider/model. Saving keys/settings does not run a paid connection test. The separate **Connect** button for AI lists provider models without generating an answer.

```powershell
.\STOP_SECTORS.ps1   # Stops the Docker stack; keeps database/Redis volumes.
```

See [Setup](docs/SETUP.md) for SMTP, administrator account provisioning, manual startup, and troubleshooting.

## Try it

- `Show my competitor watchlist.` — workspace command, no research.
- `Summarize the stored findings for TLKM.` — saved evidence, no new collection or AI generation.
- `Compare annual revenue and earnings for TLKM and EXCL.` — a new investigation; provider charges may apply.
- `Research recent product and partnership activity for BBCA.` — bounded news research, not an exhaustive search.

Use companies in your current watchlist; add or change them under **Competitors**.

## How it works

```text
Next.js UI → FastAPI → Redis/RQ worker → Sectors / approved pages
                              ↓
                   validated AI interpretation
                              ↓
                PostgreSQL evidence and results
```

The backend owns access, budgets, approved tools, source figures, arithmetic, and citation checks. The selected model proposes bounded qualitative interpretation; it cannot execute arbitrary tools or write financial facts. Opening saved results and exporting them does not collect data or regenerate analysis.

| Directory | Contents |
| --- | --- |
| [`frontend/`](frontend/) | Next.js/React interface, Zod contracts, exports, UI tests |
| [`backend/`](backend/) | FastAPI, research agent, providers, migrations, worker, backend tests |
| [`docs/`](docs/) | Setup, architecture, development, and Sectors endpoint reference |
| [`scripts/`](scripts/) | Repository checks and offline startup tests |

## Development

```powershell
# Backend: create a virtual environment and install dependencies first.
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[test]"
.venv/Scripts/python.exe -m pytest -q -m "not integration"
.venv/Scripts/ruff.exe check app tests scripts migrations

cd ../frontend
npm ci
npm test
npm run lint
npm run build
```

[Development](docs/DEVELOPMENT.md) covers checks and API contracts. GitHub Actions runs offline tests, lint, and the frontend build. [Architecture](docs/ARCHITECTURE.md) explains evidence, credentials, billing, and current limitations.

## Important limits

- Sectors requests and cloud-model use may incur **separate charges**. Internal research credits are application limits, not an authoritative provider balance.
- Missing/unreviewed evidence does not prove nothing changed. AI attribution and implications require human review.
- Some Sectors monetary fields lack currency, scale, or reporting-scope metadata. The current display/export includes a rupiah inference for large unlabeled figures; it is **not source-confirmed currency**. Review financial assumptions before using results.
- `.xls` exports are HTML-based tables, not native `.xlsx` workbooks; Excel may show a format warning.
- The included Compose/gateway setup is for **local development**, not a hardened public deployment. Keep secrets out of Git and retain the encryption master key with protected database backups.

*Information and analysis only. Not investment advice.*
