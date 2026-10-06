# RivalPulse — UI

AI competitive-intelligence agent for Indonesian public companies.
Sectors Hackathon 2026, Track 01 (AI Agents & Assistants).

The approved "Console" theme is implemented as a Next.js app with account
signup/login, a server-backed profile, and an authenticated AI workspace.
Real backend access is the default; mock data requires explicit opt-in.

## Run it

Use the repository's [../START_DEMO.md](../START_DEMO.md) for the complete
backend, local AI and same-origin proxy setup. For frontend development, copy
`.env.example` to `.env.local` and run:

```bash
npm install
npm run dev      # http://localhost:3000
```

`npm run build` type-checks and produces a production build. `npx eslint src`
lints.

## Screens

| Route | What it is |
| --- | --- |
| `/login` | Email/password login with the matching terminal theme |
| `/signup` | Account and isolated workspace registration |
| `/profile` | Saved profile, timezone, password change and logout |
| `/` | AI conversation, workspace commands and cited investigations |
| `/signals` | Full signals list with severity / unseen filters |
| `/signals/[id]` | **Signal detail** — evidence ledger, Sectors financial context, "why marketing should care" |
| `/watchlists` | Watchlist editing — add/remove competitors, rename, 2–5 rule |
| `/runs` | Run history, tool calls, live run card |
| `/sectors` | API credit budget, endpoint usage, cache policy |
| `/battlecards` | Per-competitor battlecard stubs |
| `/settings` | Thresholds, refresh policy, compliance copy |

Both designed screens are implemented at high fidelity. The other routes exist
so every sidebar item leads somewhere real during a demo.

## Architecture

```
src/
  app/            routes (App Router)
  components/
    shell/        app frame, sidebar, top bar, investigate dialog
    dashboard/    dashboard cards + the shared SignalRow
    signal/       evidence ledger, financial context
    ui/           primitives (Card, Pill, Button, Skeleton, EmptyState)
  lib/
    schemas.ts        zod schemas — THE CONTRACT, edit here
    catalogue.ts      IDX company list for watchlist building
    types.ts          types derived from the schemas
    api.ts            validated research and conversation API
    http.ts           cookies, CSRF, aborts and session expiry
    auth.tsx          account loading and identity lifecycle
    store.tsx         application state
    mock-data.ts      demo dataset + the reserve pool runs discover
    persistence.ts    account-scoped browser display cache
    demo-settings.ts  latency / failure knobs
    format.ts         date / clock helpers
```

## The backend contract

**`src/lib/schemas.ts` is the contract.** Zod schemas define every shape on the
wire; `types.ts` derives its TypeScript types from them, so runtime and
compile-time can't drift. `src/lib/api.ts` validates research responses;
`src/lib/http.ts` centralizes credentials, CSRF and request invalidation.
`src/lib/auth.tsx` handles account identity before workspace data loads.

Endpoints to implement:

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/dashboard?range=week\|month` | `{ watchlist, aggregates, signals }` |
| `GET` | `/signals/:id` | `Signal` |
| `POST` | `/runs` `{ query }` | `AgentRun` (status `queued`) |
| `GET` | `/runs/:id/stream` | SSE, one `AgentRun` per update |
| `POST` | `/runs/:id/cancel` | 204 |

Then flip two env vars (see `.env.example`):

```bash
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

Every response is parsed through zod. A missing or misspelled field fails
immediately with a message naming the field — e.g. `severity — Invalid option:
expected one of "high"|"medium"|"low"; detectedAt — expected YYYY-MM-DD` —
rather than rendering `undefined` into a demo.

Sectors responses must stay cached server-side. The 1,000-credit budget is
finite, so **never call Sectors from the client**.

### Demo controls

Press **Ctrl+Shift+D** (or add `?debug=1`) for a panel that reaches the states a
healthy dataset never produces — the ones worth filming for the judging video:
Sectors outage, empty feed, failing agent run, latency, and a reset to a first
visit. It also shows live signal / unseen / last-run counts.

The panel is hidden unless opened, so it cannot leak into a normal session.

Each control has a URL equivalent, useful for a scripted demo:

| URL | Effect |
| --- | --- |
| `?debug=1` | open the panel |
| `?latency=2000` | slow every request |
| `?fail=dashboard` | Sectors outage — shows the inline error card |
| `?fail=run` | agent run dies mid-step, with Retry |
| `?empty=1` | empty feed — the "quiet is success" state |
| `?seed=1` | wipe persisted read state |

A URL parameter seeds a setting; after that the panel governs, and writing a
setting strips the demo parameters from the URL so a stale `?fail=run` can't
override what you just turned off.

## Design system

Tokens live in `src/app/globals.css` as a Tailwind v4 `@theme` block — colours,
radii, shadows, motion. Use the token classes (`bg-card`, `text-muted`,
`rounded-card`, `transition-console`) rather than raw hex, so a palette change
stays in one file.

Rules worth keeping:

- **Evidence discipline.** Every claim is a fact, an observed signal, or an AI
  hypothesis. Hypotheses render on a dark card so an unverified interpretation
  can never look like a verified fact. Do not "tidy" that away.
- **Severity means impact on positioning**, not stock price. The UI says so
  wherever severity appears.
- **Quiet is a success state.** An empty feed reads as filtering working, never
  as an error.
- **Never substitute stale data for fresh** without labelling it.
- Contrast: all body and label text meets 4.5:1. Do not reintroduce `#8A8781` /
  `#9A968E` for text.

## Accessibility

Built in, not bolted on — keep these when editing:

- **Skip link** to `#main`, so keyboard users don't tab the sidebar on every page.
- **Focus traps** on the Investigate dialog and mobile drawer (`lib/use-focus-trap.ts`): Tab stays inside, Escape closes, focus returns to whatever opened it.
- **Live regions**: the agent run announces each step (`Step 3 of 6: …`) and its final status; toasts announce politely.
- **Comboboxes** (top-bar search, add-competitor) use `aria-activedescendant`, so the highlighted option is announced while focus stays in the input.
- **Charts** are `role="img"` with a text label listing their values.
- Visible focus ring on everything focusable; `prefers-reduced-motion` respected; all body and label text meets 4.5:1.

## Brand assets

- `src/app/icon.svg` — favicon, the orange mark from the sidebar.
- `src/app/opengraph-image.tsx` — the 1200×630 social card, generated at build
  time with `next/og`. It carries the positioning line and the fact / observed
  signal / hypothesis pills. Set `NEXT_PUBLIC_SITE_URL` once deployed so the
  card resolves to an absolute URL.

## Compliance

Information and analysis only. Not investment advice, not a recommendation to
buy or sell securities, no trade execution. The disclaimer appears on every
screen.
