# RivalPulse UI fixes — validation

Validated on 6 October 2026 in the current working tree. Existing unrelated edits were preserved.

## Implemented behavior

- The Agent question heading sits at the top left, with New chat and History in an accessible dropdown.
- Watchlist and recent-finding suggestions sit above the compact composer in new and active chats. Selecting a suggestion fills an editable draft.
- Multiline input, Enter submission, Shift+Enter newlines, loading states, and investigation restrictions remain available. Completing a run does not take focus from the dropdown or History.
- Observations use darker text, 27.75px paragraph line spacing, and prominent evidence links. Financial context follows in the same rightmost desktop column; mobile stacks without horizontal page scrolling.
- Financial displays share verified source-scale conversion and `IDR 10,751.85T` formatting. Percentage, ratio, and count units remain distinct.
- Financial source pages separate company and period, key figures, revenue and annual change charts, source records, and coverage limitations. Mobile figures use stacked rows.
- Financial research charts use annual revenue history already collected by the investigation. They make no provider requests and retain source citations.
- Missing years, conflicting figures, unavailable currency/scale/scope, nonpositive growth bases, and merger boundaries cannot produce invented growth comparisons.
- Signal titles use complete evidence-grounded summaries rather than fixed word truncation. Headlines wrap naturally.
- The supplied transparent logo is used in the sidebar, auth screens, chat mark, favicon, and social card. The copied PNG has the same SHA-256 as the supplied asset.
- Shared motion and focus styling covers pages, cards, controls, dropdowns, loading, login, and signup. Reduced-motion styles replace entrances with short fades and suppress movement; the existing auth canvas renders statically under that preference.

## Automated checks

| Check | Result |
| --- | --- |
| Frontend ESLint (`npm run lint`) | Passed |
| Frontend TypeScript (`npx tsc --noEmit`) | Passed |
| Production build (`npm run build`) | Passed, including build-time TypeScript |
| Financial data and suggestion routing (`npm run test:financial`) | 8 passed |
| Backend regressions (`pytest -m 'not integration'`) | 174 passed, 1 integration test deselected |
| Diff whitespace check (`git diff --check`) | Passed |

The backend suite uses a fresh workspace `--basetemp` because Windows denied access to the shared pytest temporary directory. Remaining warnings concern the existing AnyIO deprecation and unwritable pytest cache; they do not affect test results. Next.js builds and local preview servers ran outside the sandbox because the Windows compiler and local sockets require it.

## Browser checks

The browser used an isolated account and authored synthetic replay data, with live providers and external email delivery disabled. No live research credits were spent. Desktop checks used 1280px and 1440px widths; mobile checks used 390 × 844px. Temporary viewport overrides were reset.

- Login and signup: responsive layouts, supplied logo, form controls, and focus styling.
- Suggestions: watched company scope, relevant recent activity, immediate draft filling and focus, no automatic submission.
- Composer: editable draft, multiline and Shift+Enter, Enter sending, disabled send for empty text, and busy state.
- Dropdown: keyboard arrows, Escape restoring trigger focus, outside-click dismissal, New chat, and History.
- History during a run: History stays available; new conversation, deletion, and clearing remain disabled. Focus stays in History when the run completes. Starting a new chat retains the saved transcript.
- Observation page: aligned rightmost desktop sections, financial context directly beneath observations, darker readable paragraphs, evidence links, and mobile stacking with no horizontal page overflow.
- Source page: monetary cards/tables/axes/tooltips, source details, error retry, empty coverage, and unsupported currency coverage.
- Charts: 2023/2024/2025 source values in millions correctly display as IDR 100.00T / 120.00T / 150.00T. Keyboard ArrowRight moves to FY2024 and reports +20.00%. Compatible FY2025 reports +25.00%; the EXCL merger boundary withholds that change in both the chart and financial card.
- Final source-page browser console: no errors captured.

Reduced-motion rules and the auth canvas preference handling were reviewed in source; the browser tooling did not expose media-preference emulation, so the OS setting was not changed.

Local screenshots are saved under `.test-work/`: `ui-fixes-agent-desktop.png`, `ui-fixes-observation-desktop.png`, `ui-fixes-source-mobile.png`, and `ui-fixes-source-desktop.png`.

## Data limitations

Records without verified IDR currency or an explicit supported scale retain honest source metadata and are excluded from IDR charts. Foreign currencies are not converted without a supported exchange rate. Charts use verified annual periods only; incomplete, incompatible, or older snapshots with insufficient history show a coverage explanation. Live provider availability was not exercised during these UI checks.
