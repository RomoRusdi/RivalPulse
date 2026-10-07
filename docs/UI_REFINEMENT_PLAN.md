# UI refinement plan — 7 October 2026

Scope: smooth the left sidebar collapse (confirmed by the user), make competitor finances easier to read, remove technical provider details from company views, and align suggestions with the prompt. The changes are now implemented, including contextual New chat and History controls beneath Agent. This document preserves the design and acceptance plan; see [UI_REFINEMENT_VERIFICATION.md](UI_REFINEMENT_VERIFICATION.md) for the delivered behavior, executed checks and remaining verification limits.

## 1. Prompt alignment — implemented

Cause: AgentPrompt's outer column allowed 1,000px, while its composer and hints were limited to 840px. Above 840px, suggestions extended beyond both prompt edges.

Change: cap the shared column at 840px in `frontend/src/components/agent/AgentPrompt.module.css`. The label, recommendation grid, composer and hints now inherit the same centered width in welcome and conversation modes. Preserve mobile stacking, hover clearance, keyboard access and draft behavior.

Acceptance: label/grid and composer edges match within 1 CSS pixel; no horizontal overflow at 320px and 390px; verify with sidebar expanded/collapsed, multiline draft, and long suggestion titles. Frontend lint and production build, including TypeScript, passed.

Executed layout check: an isolated static render of the actual AgentPrompt component and stylesheet measured 0px difference between label/grid and composer edges for 1200, 900, 768, 390 and 320px containers, in both welcome and conversation modes. This checks shared-width geometry; it does not replace the planned authenticated interaction and breakpoint checks.

## 2. Left sidebar collapse — design and acceptance plan

Original implementation: AppShell immediately changed width from 244px to 80px, then translated the main pane and navigation icons with a 450ms FLIP animation. Sidebar replaced headings, labels, logo/control and footer content immediately. Main content width reflowed before the translation finished. These were plausible sources of the reported clunkiness. The replacement uses a 240ms grid transition; after-change frame/task samples are recorded in the verification document. A before/after DevTools trace was not captured.

Implementation:

- Keep a persistent collapse/expand button, icon rail and label wrappers so focus and node identity survive toggles. Keep the accessible label and `aria-expanded` accurate.
- Use one 220–260ms non-bouncy transition timeline for the surface, icons and content position. Fade labels over approximately 100ms; keep exiting labels mounted but inert until the transition finishes. Reveal expanded labels only when there is room.
- Prevent the current mismatch between immediate content reflow and delayed translation. Prototype a short CSS grid-track transition first; profile it on the financial table and chart pages. If layout cost causes dropped frames, use a clipped fixed-width sidebar and coordinated content transition instead. Do not scale live text or compound both techniques.
- Repeated toggles reverse from the current visual position, without queued animations or snapping. Clean up cancelled animations and temporary styles.
- Keep page navigation transitions separate: collapsing must not remount the page, replay chart entrances, reset scroll, clear the prompt or interrupt an active research stream.
- With reduced motion, change layout immediately; an optional short opacity fade is sufficient.

Files: `AppShell.tsx`, `Sidebar.tsx`, `lib/motion.ts`, and the relevant rules in `styles/motion-system.css` / `motion-tokens.css`. Prefer a sidebar-specific duration over changing the global 450ms token.

Additional user requirement: place New chat and History directly beneath RivalPulse agent. Show them only on the Agent dashboard. On navigation to another dashboard, fade them out and collapse their space over the same 240ms timeline; make the hidden controls inert immediately. Keep the existing chat/history behavior and keyboard focus handling.

Acceptance: expand/collapse/reverse ten times quickly; no focus loss, clipped controls, horizontal scrollbar, stretched text or final snap. Check Agent, Competitors and a chart-heavy page at 1024px, 1280px and 1440px, plus crossing the mobile breakpoint during animation. Record before/after traces; aim for smooth frames on the user's machine, with no interaction task exceeding 50ms. Confirm reduced motion and keyboard operation.

## 3. Financial presentation — recommended design

The screenshot combines very long amounts, repeated currency/scale warnings, annual figures and undated quarterly growth. The existing component already includes a shared quality notice, but repeats verbose metadata in each cell.

Recommended default: a compact comparison table with Company, Revenue, Net profit and Net margin; move quarterly growth into a clearly labelled secondary view. Keep the company column visible during horizontal scrolling. Right-align numeric columns with tabular digits. Use company cards on small screens.

| Element | Proposed presentation |
| --- | --- |
| Large amount with verified IDR and scale | `Rp 112.01T`, with exact amount available in an accessible details action |
| Screenshot value `112006326000000` with unknown currency/scale | `≈112.01 trillion reported units` plus a visible `Unit unverified` indicator; do not label it rupiah |
| Unknown currency/scale explanation | One notice above the table, with a concise per-value status and full meaning available on keyboard focus/tap |
| Reporting period | One FY label per row when metrics agree; retain per-cell dates when they differ |
| Quarterly rate lacking its quarter | Secondary view: `+0.31% · Quarter unknown`; exclude from time-based ranking and trends |
| Negative/positive values | Explicit minus/plus signs and plain labels; color is supplementary |
| Missing, conflicting, or stale values | Distinct `Not reported`, `Conflicting values`, and `Historical` states; never substitute zero |
| Detailed history | A collapsed Annual history section and a company detail page |

Offer a common-year filter and disclose exclusions. Sort/rank or create comparison charts only when currency, scale, period and business/reporting scope are comparable. For valid comparable data, offer revenue bars for scale and indexed small line charts for trend. Do not manufacture sparklines when only one observation exists. Retain merger/scope caveats near affected metrics.

Implement a shared display model separating the short value, exact value, unit/status and period. Keep raw decimal strings intact; compacting is presentation only. Use it consistently in `CompetitorPerformanceSnapshot.tsx`, the financial detail page, `FinancialHistoryChart.tsx`, `RevenueTrendGraph.tsx` and signal financial context. Extend focused formatter tests for zero, negatives, huge decimals, unknown units/currency, conflicts, rounding and period mismatches; retain the current no-inferred-IDR tests.

Acceptance: a user can identify the company, metric, period and qualification without opening a tooltip. No ranking across incomparable values; exact values remain available to keyboard and touch users. Desktop and mobile show the same information and qualifiers.

## 4. Company source details — clean presentation and actual data protection

Observed: the financial detail page renders provider name, outbound source URLs, JSON pointers and a stored record ID; the chart can fall back to an external source link. A visible provider URL alone does not establish a credential leak. Hiding DOM elements would only change appearance.

Implementation:

- Rename the page heading from Financial source to Company financials. Remove raw API endpoint links, JSON paths, stored record identifiers and calculation plumbing from regular user views.
- Replace the large technical sidebar with a compact Report information section: reporting period, retrieved date, freshness, coverage and limitations. Preserve a short provider attribution if required by its data licence; check the applicable terms before removing attribution.
- Keep traceability through an authenticated internal financial report link. Public annual-report links may remain when they lead to useful documents rather than provider API endpoints.
- Audit financial source, watchlist financial, chart, signal, error and export payloads. Keep credentials, request headers, raw provider requests and internal diagnostics on the server. Do not merely conceal them with CSS or a collapsed element.
- Inspect backend serializers and frontend schemas together before removing technical fields. Return only the fields needed by the regular UI; retain exact figures and evidence provenance in server storage. If diagnostics are needed later, use explicit server-side authorization, not a frontend role flag.
- Preserve existing workspace ownership checks, CSRF behavior and no-provider-fetch browsing. Do not delete stored snapshots or trigger fresh billable research.

Acceptance: normal pages, tooltips, links, exported files and API error bodies contain no provider credentials or technical endpoint/JSON-path detail. Authenticated response tests verify the intended public shape; cross-workspace source access remains denied. Legitimate report attribution, dates and limitations remain understandable.

## Delivery sequence and final verification

1. Alignment correction (done), followed by isolated browser geometry verification.
2. Sidebar refinement, profiled and visually reviewed on representative pages.
3. Shared financial display model and compact comparison/detail layouts.
4. Source presentation and serializer/schema cleanup in the same change, preserving necessary attribution.
5. Frontend lint/build and focused financial tests; backend source/feed/isolation tests, then the full backend suite if serializers change. Browser checks cover desktop/mobile, keyboard, reduced motion, missing metadata, conflicting values, stale evidence, long names and rapid sidebar reversals.

Use saved synthetic fixtures for UI verification. Preserve current in-progress frontend work and stored production data. Ship the layout/motion and data-contract changes as independently reviewable patches; make no database migration unless the contract audit demonstrates a need.
