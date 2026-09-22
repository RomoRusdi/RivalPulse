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
| [`backend/`](backend/) | API, Sectors integration, agent orchestration, persistence | Backend / Agent |

The two halves meet at one file: **[`frontend/src/lib/schemas.ts`](frontend/src/lib/schemas.ts)**.
It defines every shape that crosses the wire, as zod schemas. The frontend
derives its TypeScript types from it and validates every response against it,
so a mismatch fails loudly and names the offending field instead of rendering
as `undefined`.

See [`backend/README.md`](backend/README.md) for the endpoints to implement.

## Running it

**Frontend** — works standalone against mock data, no backend required:

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**Backend** — see [`backend/README.md`](backend/README.md).

To point the frontend at a running backend, copy `frontend/.env.example` to
`frontend/.env.local` and set:

```bash
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## Status

- **Frontend** — dashboard and signal detail built to the approved "Console"
  design, plus watchlists, signals list, agent runs, Sectors usage and
  settings. Runs entirely on mock data today.
- **Backend** — not started. This is the critical path: the hackathon rules
  require that removing Sectors data breaks the product's core functionality.

## Demo controls

The frontend ships a hidden panel for rehearsing the states a healthy dataset
never produces. Press **Ctrl+Shift+D**, or append `?debug=1`:
Sectors outage, empty feed, failing agent run, latency, and a reset to a first
visit. Details in [`frontend/README.md`](frontend/README.md).
