# RivalPulse — backend

Not started yet. This file is the brief.

The frontend is finished and running against mocks, so it can be pointed at
this service the moment these endpoints exist. Nothing needs to change on the
frontend except two environment variables.

## The contract

**[`../frontend/src/lib/schemas.ts`](../frontend/src/lib/schemas.ts) is the
source of truth.** Every shape below is defined there as a zod schema. The
frontend parses every response through it, so a missing or misspelled field
fails immediately with a message naming the field — for example:

```
severity — Invalid option: expected one of "high"|"medium"|"low"
detectedAt — expected YYYY-MM-DD
```

Read that file before writing handlers. It is short, commented, and it is what
the UI actually expects.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/dashboard?range=week\|month` | `{ watchlist, aggregates, signals }` |
| `GET` | `/signals/:id` | `Signal` |
| `POST` | `/runs` — body `{ query }` | `AgentRun` with `status: "queued"` |
| `GET` | `/runs/:id/stream` | Server-sent events, one `AgentRun` per update |
| `POST` | `/runs/:id/cancel` | 204 |

`GET /runs/:id/stream` drives the live step-by-step agent card. Emit one full
`AgentRun` object per update, advancing `currentStep` and appending to
`toolCalls`. On completion set `status: "complete"`, `resultSummary`, and
`producedSignalIds` listing any new signals the run found.

The frontend's mock implementation in
[`../frontend/src/lib/api.ts`](../frontend/src/lib/api.ts) walks the same six
steps and emits the same shape — use it as a reference for the sequence.

## Key entities

`Watchlist` (2–5 companies) · `Signal` (with `evidence[]` and
`financialContext`) · `AgentRun` (status, steps, tool calls) ·
`DashboardAggregates` (pipeline funnel, credit usage).

Two rules the UI depends on:

1. **Evidence has three kinds and only three**: `fact`, `observed_signal`,
   `hypothesis`. The UI renders hypotheses on a dark card so unverified
   interpretation can never look like a verified fact. Never emit a hypothesis
   labelled as a fact.
2. **`seen` is not on the wire.** Read state is currently held in the browser.
   When this service grows per-user state, add it to `SignalSchema` and the
   frontend will pick it up without a component change.

## Sectors integration

This is the critical path. The hackathon rules require that removing Sectors
data breaks the product's core functionality — right now it would change
nothing.

- Cache Sectors responses server-side (Redis or the database) with a refresh
  policy. The team has **1,000 API credits total**.
- **Never call Sectors from the client.** The frontend has no Sectors
  credentials and must not get any.
- Label cached values as cached. The UI states plainly that stale data is never
  silently substituted for fresh — keep that true.

## Suggested tooling

FastAPI + PostgreSQL, per the concept brief. Redis optional if time allows;
database caching is enough for the demo.
