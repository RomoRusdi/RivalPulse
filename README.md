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

Set a valid `SECTORS_API_KEY` in the ignored `backend/.env` (copy `backend/.env.example` if needed). Start Docker Desktop and Ollama, ensure `qwen3.8:27b` is installed, then run from the repository root:

```powershell
.\START_SECTORS.ps1
```

This starts FastAPI/PostgreSQL/Redis/Ollama with Sectors v2 as the **only live financial provider**. The startup script checks for a configured key but does not spend credits or verify the key with Sectors. Research uses bounded requests and never substitutes a different provider. Stop with `.\STOP_SECTORS.ps1`; the PostgreSQL and Redis volumes remain intact.

**Frontend** — works standalone against mock data, no backend required:

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**Backend** — see [`backend/README.md`](backend/README.md). It uses live Sectors v2 with local Ollama `qwen3.8:27b` interpretation; synthetic replay is restricted to automated tests. Tool planning stays deterministic until live key access and credit usage are validated.

To point the frontend at the private backend without exposing credentials in browser code, copy `frontend/.env.example` to `frontend/.env.local` and set:

```bash
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8080/backend
```

Start the frontend on port 3000, run `docker compose --profile frontend up -d` from `backend/`, then open `http://localhost:8080/login` and enter the private `DEMO_ACCESS_TOKEN` from `backend/.env`. The backend sets an HttpOnly demo cookie and the app checks it before loading workspace data. The profile is browser-local; this is not an email/password or multi-user account system.

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
