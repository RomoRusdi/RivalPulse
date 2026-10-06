# RivalPulse

**AI competitive-intelligence agent for Indonesian public companies.**
Sectors Hackathon 2026 — Track 01, AI Agents & Assistants.

> RivalPulse monitors competitors, combines public competitive signals with
> Sectors financial data, and uses an AI agent to explain not only what changed
> — but why it may matter to marketing and strategy teams.

Information and analysis only. Not investment advice.

---

## Repository layout

| Folder | What it is | Owner |
| --- | --- | --- |
| [`frontend/`](frontend/) | Next.js app — dashboard, signal detail, watchlists, agent runs | Frontend |
| [`backend/`](backend/) | FastAPI, Sectors integration, Ollama agent, PostgreSQL/Redis persistence | Backend / Agent |
| [`rivalpulse_agent/`](rivalpulse_agent/) | Standalone agent laboratory and deterministic fixtures | Agent reference |

The two halves meet at one file: **[`frontend/src/lib/schemas.ts`](frontend/src/lib/schemas.ts)**.
It defines every shape that crosses the wire, as zod schemas. The frontend
derives its TypeScript types from it and validates every response against it,
so a mismatch fails loudly and names the offending field instead of rendering
as `undefined`.

See [`backend/README.md`](backend/README.md) for the implemented API and operating details.

## Running it

### Sectors v2 on Windows

For step-by-step live API checks, including Sectors-only and local AI testing, see [START_SECTORS_GUIDE.md](START_SECTORS_GUIDE.md).

Set a valid `SECTORS_API_KEY` in the ignored `backend/.env` (copy `backend/.env.example` if needed). Start Docker Desktop and Ollama, ensure `qwen3.8:27b` is installed, then run from the repository root:

```powershell
.\START_SECTORS.ps1
```

This starts the frontend, FastAPI, PostgreSQL, Redis and gateway with Sectors v2 as the **only live financial provider**. When AI is enabled, it connects to the already running Ollama service. The startup script checks for a configured key but does not spend credits or verify the key with Sectors. Research uses bounded requests and never substitutes a different provider. Stop with `.\STOP_SECTORS.ps1`; the PostgreSQL and Redis volumes remain intact.

**Frontend** — uses account authentication and the backend by default:

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**Backend** — see [`backend/README.md`](backend/README.md). It uses live Sectors v2 with local Ollama `qwen3.8:27b` planning and interpretation; synthetic replay is restricted to automated tests. Plans and provider requests remain bounded by server budgets and validators.

To point the frontend at the private backend without exposing credentials in browser code, copy `frontend/.env.example` to `frontend/.env.local` and set:

```bash
NEXT_PUBLIC_AUTH_MODE=accounts
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=/backend
```

Start the frontend on port 3000, run `docker compose --profile frontend up -d` from `backend/`, then open `http://localhost:8080/signup` to create an email/password account. Configure verification SMTP in the ignored backend `.env`; new accounts activate only after entering the emailed code. Each account receives its own workspace, watchlist, research and conversation history. Profile edits are saved in PostgreSQL. Login uses an HttpOnly session cookie, temporary sessions also require a tab proof, and mutations require a CSRF token; provider credentials stay on the server. The shared token gate remains available only through explicit demo mode.

See [START_DEMO.md](START_DEMO.md) for setup and a walkthrough, and [docs/ACCOUNT_AI_INTEGRATION.md](docs/ACCOUNT_AI_INTEGRATION.md) for integration and verification details.

## Status

- **Frontend** — agent-first Next.js workspace: login lands on a scrollable conversation with workspace-synced history, while dashboards and reports remain secondary agent outputs.
- **Backend** — queued research runs, Sectors v2 financial evidence, approved public sources, immutable snapshots/revisions, and transparent signal scoring are implemented. A valid Sectors key is still required for a live financial investigation.
- **Agent** — simple watchlist/help commands run instantly. Financial questions return cited Sectors annual statements and may include a validated Qwen interpretation. Weekly activity still requires approved public evidence. PostgreSQL stores research and conversation history; previously collected test data stays archived and cannot become a live baseline.
- **Decision workflow** — agent summary reports, competitor battlecards, action scenarios, a continuously refreshed signal timeline, and bounded Gmail digests connect evidence to marketing response.

## Demo controls

The frontend ships a hidden panel for rehearsing the states a healthy dataset
never produces. Press **Ctrl+Shift+D**, or append `?debug=1`:
Sectors outage, empty feed, failing agent run, latency, and a reset to a first
visit. Details in [`frontend/README.md`](frontend/README.md).
