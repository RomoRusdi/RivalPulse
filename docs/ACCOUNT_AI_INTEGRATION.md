# Account and AI integration

Implemented locally on 2026-10-05. No GitHub push or deployment was performed.

## Data and authentication flow

Signup creates a user, workspace, owner membership and starter watchlist in one database transaction. Login uses Argon2 password verification and a revocable HttpOnly cookie session. The server derives the workspace from the session; client-supplied identity is not trusted. Registration and login are rate-limited through Redis, and mutations require both an approved Origin and a CSRF token.

Profile updates persist display name and timezone; job title has been removed from the UI. Email cannot be changed through this page. Email ownership verification activates new registrations, while existing accounts retain their workspace and can verify from Profile. The profile response includes the actual workspace and session expiry. Password changes revoke all sessions.

The authenticated workspace scopes chat context, watchlists, conversations, research submissions, active-run recovery, cancellation, signal reads and streaming. AI prompts include only that workspace's watchlist and stored findings; account email, password and session tokens are excluded. Research jobs keep their persisted workspace even after the submitting user logs out. Embedded conversation run references must belong to the workspace and are replaced with the canonical server projection.

The frontend mounts workspace state after account authentication. Browser caches are keyed by user and workspace. Logout, account switching, session expiry and cross-tab authentication changes clear or remount state and invalidate pending requests. Streams stop receiving data when a session is revoked. All real API mutations use the shared authenticated transport, including cancellation.

## AI behavior and limits

The current Sectors/Ollama implementation is preserved: bilingual routing, company aliases and scope checks, bounded tool planning, evidence classification, repair/recovery, immutable research and exports. The standalone `rivalpulse_agent` remains a laboratory; its shared JSON memory is not connected to the multi-account web app.

Conversation calls use a server-wide Redis capacity lock and bounded model timeout. Busy capacity returns `AI_BUSY` (429). Fallback and scope-guard replies are labeled in the UI. Conversation does not call Sectors. Model timeouts for research are capped by the persisted run deadline, and existing tool, credit and model-call budgets remain enforced.

Conversation history is server-authoritative in accounts mode. Loading errors block submission and are visible; save failures are visible rather than silently discarded. Follow-up suggestions survive persistence, temporary pending UI fields do not enter stored payloads, and stale transcript writes are rejected with a conflict.

Legacy scheduled sweeps are disabled in accounts mode because they have no account owner. The legacy Gmail recipient can receive only the configured preserved `WORKSPACE_ID`'s eligible results; new workspaces expose no recipient and never send their research there. Per-workspace scheduling and recipient configuration require a future explicit feature.

## Compatibility and startup

Accounts mode is the default. Explicit backend `AUTH_MODE=demo` plus frontend `NEXT_PUBLIC_AUTH_MODE=demo` retains the old shared token gate for controlled compatibility tests. Mock UI data must also be explicitly enabled. The Yahoo mode override is deprecated and rejected rather than silently starting live Sectors research.

The merged migration head retains account and conversation schemas and prior research data. Existing shared workspace access is assigned only with the administrator bootstrap command. Docker images include the diagnostics scripts. See [../START_DEMO.md](../START_DEMO.md) for the full setup and walkthrough.

## Verification and limitations

Backend: 105 passed, 1 skipped; Ruff passed. Frontend: ESLint, TypeScript during production build and all 19 routes passed. The HTTP smoke test passed and API contracts/examples were regenerated from a clean synthetic replay database.

Tests cover account isolation, AI prompt isolation, foreign run references, canonical run history, CSRF, capacity locking, session revocation during streaming, password/session behavior and prior AI/research regressions. Browser checks use a separate migrated SQLite database, fakeredis and replay evidence; they do not modify the configured live database or consume provider credits.

The browser walkthrough passed signup, profile save, labeled chat fallback, a cited investigation, persistence after reload, logout/login restoring the profile and research, and an empty separate history for a second account. The test proxy buffers SSE; incremental updates and midstream session revocation are verified by backend tests rather than this browser proxy.

Live PostgreSQL, Redis and Ollama were unreachable on this machine during verification, and Docker Desktop's Linux engine was stopped. The current account-to-live-Qwen/Sectors flow therefore still needs the services started and the connection probe/demo above. Historical live checks in backend documentation are separate from this verification. A fallback reply is not proof that Ollama generated a response.

The account quality update adds hashed email verification challenges, expiration cleanup, tab-bound temporary login, workspace research quotas and an authenticated stored financial source viewer. The provider credit account/cache remains shared at the server level. Known limits: no workspace invitations, password-reset email, account deletion or per-workspace model settings. Browser session restore can restore temporary tab storage; explicit logout is the reliable way to revoke server access immediately.
