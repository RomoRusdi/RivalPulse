RivalPulse motion implementation · 6 October 2026

7 October refinement: the prompt bar is now borderless, 64px tall, and at most 840px wide. New chat and History open from a dropdown beneath the Agent navigation item, including an icon-only version for collapsed navigation. Existing workspace handlers and busy restrictions are retained; mobile menu Escape handling and History focus return are included.

7 October UI follow-up: the Agent's new-chat screen now uses the requested centered Inter heading, three watchlist-based recommendation cards, a mint radial glow, and the 1000 × 88 green prompt bar. Draft filling is cancellable and never submits a recommendation automatically. The first sidebar marker position is applied without animation, with a green active-link fallback before hydration. Research, financial formatting, authentication, and other page behavior are unchanged. The audit below records the earlier motion pass; the ask screen additionally uses the requested short blur, border/background/shadow feedback, and heartbeat drawing, all with reduced-motion alternatives.

The existing green palette, logo, page structure, saved research, and history behavior are preserved. No animation dependency was added. Motion uses CSS, small React hooks, Web Animations for sidebar FLIP, and the installed Next.js App Router's React ViewTransition integration.

**Audit, ranked by impact**

| Impact | Before | Interruption and reduced motion before | Resolution |
| --- | --- | --- | --- |
| 1 | Chat assigned scrollTop = scrollHeight on research updates. Reading older content was interrupted. | Instant writes could not be reversed; no separate scroll-motion preference. | Cancellable critically damped follow, user-intent interruption, explicit Jump to latest. |
| 2 | Sidebar animated width for 200ms; bars animated width through transition-chart. | CSS could retarget, but layout ran during the transition. The global reduced-motion rule shortened durations. | Final layout changes once. Sidebar surface scales, icons/content translate, bars scaleX. |
| 3 | Chat/account/select/company menus were removed immediately on close. | Entrances varied from 140–200ms; exits could not reverse because DOM nodes were gone. | Mounted exit lifecycle with inert/aria-hidden and scale/opacity CSS transitions that reverse from the current pose. |
| 4 | Textarea reset height to auto, read scrollHeight, then assigned height on each draft. | Abrupt changes, no height transition. | A hidden mirror and ResizeObserver drive a 0fr–1fr grid growth row. Placeholder wrapping is measured too. |
| 5 | Authentication ran a continuous procedural WebGL shader and pointer-position reads. | It stopped when hidden and used a static frame if reduced motion was enabled at mount. | Preserve the shader artwork as a static frame; redraw only on resize and release GPU resources on unmount. |
| 6 | Skeletons animated background-position; stage pulses animated box-shadow; chart lines animated stroke-dashoffset; chart points transitioned radius/stroke-width. | Mostly mount-only effects; global reduced-motion handling existed but was split across several rules. | Skeleton pseudo-layer translates, small indicators pulse opacity, chart entrances fade/scale; point emphasis updates immediately. |
| 7 | Cards/pages entered over 220ms with a 4px translation; modals/drawers/toasts already had delayed exits. Hover/focus transitioned colors, borders, and shadows over 160–200ms. | CSS transitions were retargetable; one-shot entrances restarted on mount. Reduced-motion exceptions were inconsistent. | Shared durations/springs, 8px entrances, shorter exits, opacity focus layers, one central preference policy. |
| 8 | Suggestions, heading, budget counters, and exclusions changed without coordinated motion. Profile avatar differed in size from the header. | No interruption lifecycle or animated count. | Stagger up to six chips, compact heading, tabular counters, one expandable exclusion row, matching 36px avatars. |

The shared motion system avoids width, height, top, margin, color, shadow, stroke, and background-position animations. Transform includes the existing individual scale utilities. Grid-template-rows is the expansion exception. The later ask-screen refinement additionally uses the requested blur, border/background/shadow feedback and heartbeat drawing. The scroll spring changes scroll position to implement navigation through messages, rather than animating layout geometry. View-transition group geometry animations are disabled.

**Motion tokens**

The complete implementation is in [motion-tokens.css](D:/RivalPulse/RivalPulse/frontend/src/styles/motion-tokens.css). Values are shared by CSS and JavaScript:

| Token | Value / purpose |
| --- | --- |
| --motion-micro / standard / large | 120ms / 250ms / 400ms |
| --motion-exit | 150ms; shorter than entrances |
| --motion-response-smooth | 450ms, sampled ζ≈1.0 |
| --motion-response-snappy | 350ms, sampled ζ≈0.85 |
| --motion-response-bouncy | 500ms, sampled ζ≈0.7; available but intentionally unused |
| --motion-sheet | cubic-bezier(0.32, 0.72, 0, 1) |
| --motion-press | 0.97 |
| --motion-distance / stagger | 8px / 30ms |

Spring samples use CSS linear() inside @supports, with cubic-bezier fallbacks. Reduced motion removes press/travel/stagger, makes expansion and sidebar positions immediate, and retains short opacity fades. See [MDN linear()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/easing-function/linear) and [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition). Implementation follows the installed Next.js 16.3.5 documentation; no canary package or configuration flag was added.

**File-by-file before → after**

Paths below are relative to the repository root. These are the concrete code/behavior changes; the workspace diff contains the complete source changes.

| File | Before | After |
| --- | --- | --- |
| frontend/src/styles/motion-tokens.css | No central motion file. | New durations, response times, three spring samples, easing, press, distance, stagger and reduced-motion tokens. |
| frontend/src/styles/motion-system.css | Motion spread through component classes and globals. | New reusable press/popover/grid/chip/message/nav/meter/route classes, scroll mask, blur layer, focus layer, thin scrollbars. |
| frontend/src/app/globals.css | Mixed 140–700ms effects; layout/paint transitions; duplicated reduced-motion and unused legacy composer CSS. | Imports the token/system files. Retains every palette token. Compositor entrances and skeleton layer, centralized preference rules, removes unused composer styles. |
| frontend/src/lib/motion.ts | No shared lifecycle helpers. | New reversible presence, cancellable counter, and batched FLIP helpers. will-change exists only while a FLIP animation runs. |
| frontend/src/lib/use-chat-scroll.ts | Scroll implementation lived in AgentWorkspace. | New user-intent-aware spring with ResizeObserver, wheel/touch/key/scrollbar interruption and a keyboard-focusable jump target. Floating-point integration avoids an endless subpixel loop. |
| frontend/src/components/agent/ReceivedText.tsx | Assistant text replaced immediately. | New received-chunk opacity component. Append-only updates fade the new suffix; replacements reset. No simulated typing or delayed answer. |
| frontend/src/components/ui/AnimatedNumber.tsx | Plain budget and badge numbers. | New tabular counter, optional roll entrance, exact final value and configurable decimal precision; assistive text exposes the actual value. |
| frontend/src/components/ui/ExpandableSummary.tsx | Repeated exclusion paragraphs. | New button with aria-expanded/controls, inert hidden content, rotating chevron and reversible grid expansion. |
| frontend/src/components/shell/AppShell.tsx | transition-[width] on sidebar; keyed CSS page entrance. | Capture geometry, flush one layout update, animate sidebar surface/icons/content by transform; React ViewTransition wraps only routed content. |
| frontend/src/components/shell/Sidebar.tsx | Each active link painted its own background; width-based fill; static counters; 32px footer avatar. | One measured spring indicator; count animation; scaleX fill; 36px avatar. Indicator corner proportions are compensated when collapsed. |
| frontend/src/components/agent/AgentPrompt.tsx | Per-draft height reset/read/write; chips stayed visible while typing. | One mirror observer, grid growth, placeholder measurement; chip wrapper entrance separate from button press; hide/inert suggestions while typing. |
| frontend/src/components/agent/AgentPrompt.module.css | Abrupt height, large mixed-property focus transitions. | Compact 40px input base plus bounded grid growth; opacity focus ring and Send accent layer; larger readable hints. |
| frontend/src/components/agent/AgentWorkspace.tsx | Instant follow; always-expanded heading/subtitle; width progress fill; small financial footnotes. | Scroll hook, jump pill, message/chunk entrances, compact heading, collapsed subtitle, scaleX progress, result press/arrow feedback, 11–12px footnotes with stronger existing text colors. |
| frontend/src/components/agent/AgentControls.tsx | open ? menu : null. | Reversible presence; open state drives inert/aria-hidden and trigger-origin scale/fade. Existing keyboard/history/run restrictions retained. |
| frontend/src/components/shell/UserMenu.tsx | Immediate unmount. | Shared presence, blur dismissal and top-right origin; existing account/logout actions retained. |
| frontend/src/components/ui/Select.tsx | 140ms mount animation and immediate exit. | Shared presence; origin follows above/below placement; closed portal is inert during exit; keyboard selection retained. |
| frontend/src/components/ui/CompanyPicker.tsx | Immediate close, generic modal entrance. | Shared popover lifecycle, focus layer, top-center origin, thin scroll area; debounced catalog requests still abort on close. |
| frontend/src/components/dashboard/FinancialHistoryChart.tsx | Plain gray empty paragraph and one exclusion paragraph per company. | Icon, shorter copy and one action; configurable loading skeleton; one expandable total with company breakdown; verified chart math unchanged. |
| frontend/src/app/(app)/financial-sources/[id]/page.tsx | Empty chart source action could link back to the same page. | Empty action points to the page's source-details section, giving the user a useful next step. |
| frontend/src/components/dashboard/SignalMix.tsx | width: share%. | Full-width layer, transform: scaleX(share / 100). |
| frontend/src/components/dashboard/SignalPipeline.tsx | width: mounted ? percent : 0. | Full-width layer, transform: scaleX(mounted ? percent / 100 : 0). |
| frontend/src/app/(app)/sectors/page.tsx | width: percent%. | Full-width scaleX meter. |
| frontend/src/components/ui/primitives.tsx | Tailwind scale utility with mixed-property transition-console. | Shared rp-press for Button and ButtonLink. |
| frontend/src/components/auth/LoginForm.tsx | Static button label and hard field focus only. | Shared press feedback, label fade, opacity focus layers. Authentication submission unchanged. |
| frontend/src/components/auth/SignupForm.tsx | Mixed-property button transition, 6px field gaps. | Shared press/label fade/focus layers, 8px field gaps. Registration/verification logic unchanged. |
| frontend/src/components/auth/FaultyTerminal.tsx | Continuous shader and pointer animation. | Existing shader drawn at a fixed frame on resize; no idle loop, flicker, or pointer geometry reads; buffers/program/shaders cleaned up. |

Representative before/after code:

```tsx
// Progress: before
<div style={{ width: `${percent}%` }} className="transition-chart" />
// After: no animated width
<div className="rp-spring-fill h-full w-full origin-left"
  style={{ transform: `scaleX(${percent / 100})` }} />

// Menu: before
{open ? <div role="menu">…</div> : null}
// After: exit remains mounted and reverses cleanly on reopen
const { open, present, setOpen } = useReversiblePresence();
{present ? <div role="menu" className="rp-popover"
  data-open={open} inert={!open} aria-hidden={!open}>…</div> : null}

// Scroll: before
element.scrollTop = element.scrollHeight;
// After: content growth schedules only while following.current is true;
// wheel/touch/PageUp/Home interrupt; Jump to latest resumes explicitly.
const { viewport, content, onScroll, showJump, jump } = useChatScroll(id, signature);

// Route: before
<div key={pathname} className="rp-page-enter">{children}</div>
// After: browser transition with an unsupported-browser CSS fallback
<ViewTransition key={pathname} enter="rp-route" exit="rp-route" default="none">
  <div className="rp-route-page">{children}</div>
</ViewTransition>
```

```css
/* Expansion: reversible from its current computed fraction. */
.rp-expand { display: grid; grid-template-rows: 0fr; opacity: 0;
  transition: grid-template-rows var(--motion-response-smooth) var(--spring-smooth),
              opacity var(--motion-exit) ease-out; }
.rp-expand[data-open="true"] { grid-template-rows: 1fr; opacity: 1; }
.rp-expand > div { min-height: 0; overflow: hidden; }
```

**Validation**

Automated checks: npm run lint, npx tsc --noEmit, npm run build, git diff --check all passed. npm run test:financial passed all 8 tests, covering source units/currencies, percentages/counts, compatible annual change, gaps, conflicting periods and grounded suggestions.

Browser checks used an isolated local replay preview, synthetic accounts and data, with external research/email disabled. Verified desktop 1280×720, mobile 390×844 and narrow mobile 320×740; rapid routes/collapse reversals; clear will-change after settlement; menu close/reopen/Escape/keyboard focus; suggestion draft filling; Enter/Shift+Enter; six-line growth; rapid separate submissions; History enabled/New chat blocked during research; unchanged scroll position while research completes after PageUp; Jump to latest reaches the bottom; chart keyboard inspection; +20.00% and +25.00% from IDR 100.00T/120.00T/150.00T; merger-boundary change withheld; unsupported XTS values retained as source units; one expandable five-source exclusion row; signup catalog menu and login/signup focus/layout. No browser console errors observed in these checks.

The final sidebar reversal measured its animated surface edge and content edge at 232.83894px and 232.83891px in the same frame. Source-service failure and enabled retry were verified with a local 503 fixture; the empty-state action moved to the source-details section. Browser viewport overrides and service fixtures were reset after testing.

The backend returns chat replies as complete text. ReceivedText supports actual future append-only chunks, but this change does not introduce a new streaming transport. Chart rendering uses returned/saved evidence and makes no additional research request.

Reduced-motion CSS and JavaScript paths were reviewed; the available browser tool cannot emulate the OS preference. Physical iOS/Safari, an unsupported View Transitions browser, and low-end-device frame profiling remain manual checks. No 60fps benchmark is claimed. Signup account creation and live provider behavior were not repeated because their logic did not change.

**Manual test checklist**

- [x] Rapidly alternate Agent / What changed / Competitors; verify final active indicator and route, with no stuck overlay.
- [x] Collapse/expand sidebar before it finishes; confirm background/content edges settle together and profile avatar stays clear.
- [x] Open, close and reopen Chat controls before exit completes. Use arrows/Home/End/Escape/Tab and outside click; focus must remain visible and Escape must restore the trigger.
- [x] Fill a suggestion; it must remain editable and must not send. Typing hides chips; clearing the draft brings them back.
- [x] Enter sends; Shift+Enter inserts a newline. Send separate messages quickly and confirm no duplicate or missing submissions.
- [x] Scroll up during research. Updates must preserve reading position. Activate Jump to latest with the keyboard and confirm focus moves to the conversation.
- [x] During a run, History remains available and New chat remains disabled.
- [x] Resize between desktop, 390px and 320px. Check heading, menus, composer, chart labels and horizontal overflow.
- [x] Check IDR/source units and annual change against known values; verify unsupported currency and merger/gap boundaries do not create invented values.
- [x] Expand/collapse the source-exclusion summary rapidly and with Enter/Space; inspect aria-expanded/controls and hidden content.
- [x] Review login/signup field focus, picker dismissal, button state, logo proportions and narrow layout.
- [ ] Enable OS Reduce Motion before loading and toggle it while open. Expect fades only, no travel/bounce/press scaling, immediate grid/scroll/sidebar positioning, static loading artwork, correct meter and active-indicator positions.
- [ ] Run on an older browser without View Transitions. Navigation and keyboard behavior must work with the CSS entrance fallback.
- [ ] Run on physical iOS/Safari, including touch scrolling and the software keyboard.
- [ ] Profile on a low-end device: repeated navigation, long chat and multiline typing. Confirm no long animation tasks, no perpetual idle RAF loop and acceptable frame time; test under reduced CPU as well as real hardware.
