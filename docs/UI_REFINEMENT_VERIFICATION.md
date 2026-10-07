# UI refinement delivery and verification — 7 October 2026

The [design plan](UI_REFINEMENT_PLAN.md) is implemented. Existing unrelated frontend work and stored application data were preserved. There is no database migration and no new paid provider research was triggered.

## Delivered behavior

- New chat and History appear directly beneath RivalPulse agent. They fade and collapse when navigating to any other dashboard, and expand on return. Hidden controls are inert and absent from the accessible navigation. Collapsed desktop navigation retains their icons while Agent is active. History remains available during research; New chat is disabled until the active research finishes.
- Sidebar collapse uses one reversible 240ms CSS grid transition, with stable controls and short label fades. The previous width-change/FLIP combination is removed. Reduced motion changes the layout immediately. Page state, prompt drafts, scroll and chart selections survive toggling.
- Suggestions and the composer share an 840px maximum width. The shell also constrains its grid row, fixing a mobile conversation layout that could push the composer below the viewport.
- Company comparisons use compact revenue, net profit and margin columns; mobile uses cards. Reporting years, unit qualifications, scope caveats and missing/conflicting states remain visible. Quarterly rates and annual history are separate disclosures. Comparison charts require compatible periods, currency, scale and scope.
- Monetary formatting rounds decimal strings for display without replacing the original value. Unknown currency or scale is explicitly unverified. Exact values are available through keyboard/touch disclosures and exported as text to avoid spreadsheet rounding of long numbers.
- Company financials replaces the technical source view with reporting period, retrieval/freshness, coverage, attribution and limitations. Regular financial, signal, chart, conversation and research responses omit provider endpoints, JSON pointers and raw provider payload details. Internal authenticated report links preserve access to saved evidence. Full provenance remains in server storage; ownership checks and CSRF behavior remain in place.
- The startup repair remains active: serialized Compose operations, a single build, bounded retries for recognized transient engine failures, and gateway readiness checks.

## Executed checks

| Check | Result |
| --- | --- |
| Full backend pytest suite | 177 passed; one opt-in service integration test skipped in this run |
| Real PostgreSQL/Redis integration | 1 passed separately, using an isolated temporary schema and queue |
| Public evidence response tests | Canonical/feed/source/signal/compat/SSE responses and old saved conversations checked; stored provenance retained; cross-workspace protection covered by the backend suite |
| Backend Ruff | Passed for app, tests, scripts and migrations |
| Frontend financial/router/export tests | 13 passed, including decimal precision, unknown units, conflicts, safe links and the generated export Blob |
| Frontend ESLint | Passed |
| Frontend production build | Passed, including TypeScript and all 19 generated pages |
| Startup regression checks | 4 passed: success, transient recovery, bounded retries and immediate failure on other errors |
| Actual START_SECTORS.ps1 | Passed build, Compose startup, proxy restart and frontend/API readiness |
| HTTP smoke and gateway authentication | Both passed |
| Running application | API/PostgreSQL/Redis healthy; worker/reconciler running; migration and seed exited 0; gateway on port 8080 |
| Whitespace checks | git diff --check passed |

Docker Desktop was stopped during the first service integration attempt in this pass. Starting Docker Desktop restored the engine; the real integration check and actual startup script then passed. No persistent volumes were deleted.

## Browser verification

Authenticated browser checks used isolated saved synthetic fixtures through a local gateway, with replay research and a separate SQLite database. They did not modify the user's production workspace or call paid providers.

- Suggestion label/grid and composer edges matched with a measured 0px difference at 1440, 1280, 1024, 768, 390 and 320px viewport widths, in welcome and conversation modes. No horizontal overflow was observed. Draft text and focus survived toggling.
- Ten rapid keyboard sidebar toggles during an active synthetic research stream preserved focus and let the stream finish. The largest sampled animation frame interval was 10.1ms; no long tasks were observed.
- On the chart-heavy Competitors page, ten rapid toggles preserved the selected 2024 year, the chart and main scroll position. The largest sampled interval was 10.2ms; no long tasks were observed. There was no horizontal overflow.
- Crossing the mobile breakpoint during collapse retained usable navigation and the final sidebar state. At 320px, mobile History opened, Escape closed it, and focus returned to Open navigation. New chat also worked.
- New chat/History had zero height, hidden visibility and no accessible links on Competitors. Their container expanded again on return to Agent. The exit timeline uses 240ms height collapse and 100ms opacity, with delayed visibility removal.
- Reduced-motion fixture checks confirmed immediate sidebar layout changes and stable toggle focus. Only the short opacity fallback remained.
- Company financials displayed the reporting period and unit qualification, and Enter opened the exact-value disclosure. At 320px and 390px it had no horizontal overflow. Visible links did not include provider API endpoints, JSON pointers or stored-record diagnostics.
- Compatible FY2024 revenue bars excluded the unverified-unit company and disclosed the exclusion. Quarterly rates with no supplied quarter were labeled Quarter unknown.
- No browser warning/error console messages were captured in the final preview inspection.

Saved screenshots (synthetic data):

- [Agent navigation and aligned prompt](../.test-work/screenshots/agent-refined.jpg)
- [Chat history](../.test-work/screenshots/chat-history.jpg)
- [Compact company comparison](../.test-work/screenshots/financial-refined.jpg)

## Verification limits

The frame/task measurements are after-change browser samples, not a before/after DevTools performance trace or a guarantee of performance on every display/GPU. Reduced motion was exercised with a local fixture matching the media-query rules, not by changing the user's OS preference. Live paid Sectors calls, real model inference and email delivery were not exercised. The export Blob's contents and exact-value text formatting passed an automated test; an actual browser download path could not be confirmed because the browser download event timed out.

## Review groups

1. Layout and navigation: AppShell, Sidebar, AgentControls, mobile focus handling, motion styles and prompt geometry.
2. Financial presentation and delivery contract: the shared financial display/value components, comparison/detail/chart/signal views, export generation, frontend schemas, backend public evidence serializers, generated API documentation and focused tests.

AgentWorkspace contains hunks for both groups. Changes are left unstaged for review; no commit or deployment was made.
