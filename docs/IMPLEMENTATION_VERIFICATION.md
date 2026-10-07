# RivalPulse implementation verification

Checked on 7 October 2026 against the current working tree. Existing unrelated changes were preserved. Browser checks used the production Next.js build and an isolated local replay backend with synthetic accounts, conversations, findings, and financial data. Live research providers, alerts, and outbound email were disabled.

## Issues found and fixed

| File | Finding | Result |
| --- | --- | --- |
| `frontend/src/components/shell/MobileDrawer.tsx` | Resizing an open mobile drawer to desktop hid the dialog but retained its focus trap. Short landscape screens also hid the profile footer below the drawer. | Unmount the drawer at the desktop breakpoint, move focus to visible content, allow vertical scrolling, and clean up delayed close callbacks. Reduced motion closes without a movement delay. |
| `frontend/src/components/agent/AgentNavigation.tsx` | Changing the research restriction temporarily unregistered the sidebar actions and disabled the focused menu trigger. | Keep action registration stable across busy-state changes; unregister only on unmount. |
| `frontend/src/components/agent/AgentControls.tsx` | The menu could dismiss when its focused New chat item became disabled. ArrowUp opening and Tab behavior needed refinement. | Transfer focus to an enabled item before paint, retain the open menu, support ArrowUp/Down, Home/End and Escape, and let Tab leave the menu. Outside-click dismissal remains available. |
| `frontend/src/components/agent/AgentWorkspace.tsx` | New chat and the composer remained available between sending a research request and receiving its queued run. | Lock immediately during the initial request and release on success or failure. History remains readable during investigations. |

## Automated results

| Check | Result |
| --- | --- |
| `npm run lint` in `frontend` | Passed |
| `npx tsc --noEmit` in `frontend` | Passed |
| `npm run build` in `frontend` | Passed; production build generated 19 pages and completed its TypeScript check |
| `npm run test:financial` in `frontend` | 8 passed |
| Backend regression tests for conversations, chat, financial feed/projection/brief, signal titles, and browser authentication | 53 passed; one existing Starlette/AnyIO deprecation warning |
| `git -c core.safecrlf=false diff --check` | Passed |

Backend command (workspace-local temporary output avoids sandbox temporary-directory restrictions):

```powershell
.venv/Scripts/python.exe -m pytest tests/test_conversations.py tests/test_chat.py tests/test_financial_feed.py tests/test_financial_projection.py tests/test_financial_brief.py tests/test_signal_titles.py tests/test_browser_auth.py -q --basetemp=../.test-work/pytest-fullcheck-20261007-b -p no:cacheprovider --tb=short -o faulthandler_timeout=45
```

## Browser coverage

Tested at 1366 × 900, 1024 × 768, 390 × 844, 320 × 740, and 568 × 320. These are browser viewport checks, not physical-device tests.

- Green theme and existing logo placements remain consistent. The desktop welcome composer is borderless, 840px wide at most and 64px tall before multiline growth. Narrow layouts wrap without horizontal scrolling. The active sidebar marker aligns on first render and after collapsing.
- Rapid navigation and repeated sidebar/menu interruptions work. The Agent dropdown sits below its navigation entry, including the collapsed-sidebar version. Arrow keys, Home/End, Escape, Tab and outside-click behavior work.
- Suggestions reflect the synthetic watchlist and recent findings. Clicking fills an editable draft without sending. Manual edits cancel animated filling. Enter sends, Shift+Enter inserts a newline, and long drafts scroll within the bounded textarea.
- Multiple consecutive chat submissions retain order. Saved history opens, switches conversations and survives reload. During research, New chat and destructive history controls are disabled while existing history remains readable. Mobile History dismissal returns focus to the navigation opener.
- Opening the mobile drawer and resizing to desktop no longer traps focus. The short landscape drawer scrolls far enough to reach the profile card and research credits.
- Scrolling up during research stops following new output; completion does not force a jump. Jump to latest returns to the bottom.
- Observed evidence and financial context share the rightmost desktop column and stack on narrow screens. Evidence links remain visible.
- Synthetic annual revenue reported in IDR millions (100,000,000; 120,000,000; 150,000,000) displays as IDR 100.00T, IDR 120.00T and IDR 150.00T, with 20.00% and 25.00% changes. Keyboard chart inspection selects the matching period and tooltip. Merger scope breaks omit incompatible growth and connecting lines. Chart inspection uses saved investigation data without another research request.
- A synthetic unsupported-currency series remains in its original currency and units. The chart explains insufficient coverage instead of relabeling values as IDR. Five exclusions collapse into one accessible summary; rapid keyboard expansion/collapse and its source-details action work.
- Injected source-page failure shows an error and a working retry. Injected research-start failure shows Research unavailable and releases the composer and New chat restrictions.
- Login validation and password visibility work by keyboard. Signup company search, keyboard selection, Escape, outside dismissal, focus feedback and responsive layout work. No new account was created. Sidebar/footer avatars align at the same size as the header avatar.
- No application JavaScript exceptions were observed. Injected HTTP failures produced the expected network errors and visible recovery states.

## Remaining manual verification and limits

- Test physical iOS/Android touch and software keyboards, a low-end device with frame profiling, and a browser without View Transitions support.
- Test the operating system's reduced-motion preference. The reduced-motion and fallback source paths were reviewed, but this browser controller did not expose preference emulation.
- Confirm the XLS browser download handoff manually. The download-event wait timed out; the existing Blob/download implementation and shared financial formatter were reviewed, but a downloaded file was not captured.
- Live provider results, outbound verification email, and final signup creation were not exercised. The fixture validates known data and error handling, not external provider availability or the completeness of real financial coverage.
- The current backend returns complete chat text. The received-text component supports appended chunks, but these UI changes do not introduce a streaming transport.

Motion tokens, the original ranked audit, and the file-by-file implementation notes are in [MOTION_IMPLEMENTATION.md](./MOTION_IMPLEMENTATION.md).
