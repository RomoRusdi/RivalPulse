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

### Yahoo testing mode on Windows

Start Docker Desktop and Ollama, ensure `qwen3.8:27b` is installed, then run from the repository root:

```powershell
.\START_YAHOO_TEST.ps1
```

This starts the real FastAPI/PostgreSQL/Redis/Ollama stack with explicit `MODE=yahoo`. Yahoo annual financials are development-only, labeled throughout the application, and never act as a fallback for Sectors. Stop it with `.\STOP_YAHOO_TEST.ps1`.

**Frontend** — works standalone against mock data, no backend required:

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**Backend** — see [`backend/README.md`](backend/README.md). It supports explicit Yahoo development testing and live Sectors v2 research with local Ollama `qwen3.8:27b` synthesis. Synthetic replay remains restricted to automated tests.

To point the frontend at the private backend without exposing credentials in browser code, copy `frontend/.env.example` to `frontend/.env.local` and set:

```bash
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8080/backend
```

Start the frontend on port 3000, run `docker compose --profile frontend up -d` from `backend/`, then open `http://localhost:8080/backend/demo/login` and authenticate with the local `DEMO_ACCESS_TOKEN` before opening `http://localhost:8080`.

## Status

- **Frontend** — agent-first Next.js workspace: login lands on a scrollable conversation with workspace-synced history, while dashboards and reports remain secondary agent outputs.
- **Backend** — queued research runs, Sectors v2 production evidence, explicit Yahoo test evidence, approved public sources, immutable snapshots/revisions, and transparent signal scoring are implemented.
- **Agent** — simple watchlist/help commands run instantly. Yahoo-mode financial questions use Qwen-planned bounded tools, return cited annual statements, and optionally add a validated qualitative interpretation. Weekly activity still requires approved public evidence. PostgreSQL stores research and conversation history; Yahoo is never a silent Sectors fallback.
- **Decision workflow** — agent summary reports, competitor battlecards, action scenarios, a continuously refreshed signal timeline, and bounded Gmail digests connect evidence to marketing response.

## Demo controls

The frontend ships a hidden panel for rehearsing the states a healthy dataset
never produces. Press **Ctrl+Shift+D**, or append `?debug=1`:
Sectors outage, empty feed, failing agent run, latency, and a reset to a first
visit. Details in [`frontend/README.md`](frontend/README.md).
