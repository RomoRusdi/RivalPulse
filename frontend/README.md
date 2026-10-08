# RivalPulse frontend

Next.js App Router, React, TypeScript, Tailwind, Zod, and Lucide icons. Real account-authenticated backend access is the default; mocks require explicit opt-in.

## Run

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` only if absent. Use `NEXT_PUBLIC_AUTH_MODE=accounts`, `NEXT_PUBLIC_USE_MOCKS=false`, and `NEXT_PUBLIC_API_BASE=/backend`. The frontend listens on port 3000; use the same-origin gateway at **http://localhost:8080** for the complete app. See [Setup](../docs/SETUP.md).

## Main routes

| Route | Purpose |
| --- | --- |
| `/` | Agent conversation, workspace commands, saved history, research results |
| `/watchlists` | Competitors and independent own-company perspective |
| `/signals`, `/signals/[id]` | Findings, source evidence, structured interpretation |
| `/financial-sources/[id]` | Saved company financial reports |
| `/runs` | Research history |
| `/actions`, `/battlecards` | Evidence-based response views |
| `/settings`, `/sectors` | Workspace provider/model settings and internal data allowance |
| `/login`, `/signup`, `/profile` | Accounts, verification, profile/password management |

Legacy overview/summary/timeline routes redirect to findings rather than duplicating pages.

## Code and checks

- `src/app/`: routes; `src/components/`: reusable product UI.
- `src/lib/schemas.ts`: Zod response contracts; `types.ts`: inferred types.
- `http.ts` / `api.ts`: authenticated transport and validated requests.
- `agent-router.ts`: instant commands, saved recall, and research intent.
- `financial-display.ts` / `export-xls.ts`: financial presentation and run-specific Excel-compatible exports.
- `store.tsx`: workspace state; `mock-data.ts`: explicit demo/test fixtures.

```sh
npm test
npm run lint
npm run build
```

Read `AGENTS.md` and the installed Next.js docs before editing routes. Preserve accessible names, keyboard focus, responsive overflow, reduced motion, and the distinction between observed evidence and AI inference. Never put provider keys in `NEXT_PUBLIC_*` variables or browser storage.

See [Architecture](../docs/ARCHITECTURE.md) for export behavior and financial caveats; [Development](../docs/DEVELOPMENT.md) for handoff/checks. This frontend's local-development setup is not a complete public deployment.
