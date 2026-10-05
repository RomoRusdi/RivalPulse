# RivalPulse QA guide — test every possibility

How to use this: work top to bottom on a fresh stack. Tick boxes as you go.
`[auto]` items are covered by the automated suites — run those first.
`[manual]` items need a human in the browser. Anything marked `(live)` needs
the real backend + Sectors key; everything else also works against mocks.

> Frontend defaults to **mock mode** (`NEXT_PUBLIC_USE_MOCKS !== "false"`).
> Mock runs are simulated, credits are fixture data, and chat replies are
> canned. The full stack (`.\START_SECTORS.ps1`) switches the frontend to the
> live backend. Bugs that only appear live are marked `(live)`.

## 0. Prerequisites

- [ ] Docker Desktop running (Linux containers), Ollama running, `ollama pull qwen3.8:27b` done
- [ ] `backend/.env` exists with a 16+ char `DEMO_ACCESS_TOKEN` and a valid `SECTORS_API_KEY`
- [ ] Stack started: `.\START_SECTORS.ps1` from the repo root, no errors at the end
- [ ] App opens at `http://localhost:8080/login`, token signs you in
- [ ] API healthy: `http://localhost:8000/api/v1/health/ready` returns `{"status":"ready","mode":"live"}`

## 1. Automated checks `[auto]`

From `backend/` (needs the `.[test]` extras installed):

```powershell
python -m pytest -q -p no:cacheprovider -k "not integration"   # expect: all pass
python -m ruff check app tests scripts migrations               # expect: clean
```

From `frontend/`:

```powershell
npx tsc --noEmit   # expect: clean
npx eslint src     # expect: clean
```

- [ ] Backend suite green (covers: run lifecycle, idempotency, baselines →
      unchanged → updated, credit budgets, LLM fallback paths, chat scope,
      plan budgets incl. 5-company watchlists, comparison scoping, silent
      companies, scheduled sweeps, session resume endpoint)
- [ ] `tsc` + `eslint` + `ruff` clean
- [ ] Optional, needs Postgres+Redis: `TEST_DATABASE_URL=… TEST_REDIS_URL=… python -m pytest -m integration -q`

## 2. Reset & restart

- [ ] Soft restart rebuilds images but keeps data: `.\STOP_SECTORS.ps1`, then `.\START_SECTORS.ps1`
- [ ] After restart, previous signals/runs/history are still there
- [ ] Full wipe destroys everything and reseeds: `cd backend; docker compose --profile frontend down --volumes; cd ..; .\START_SECTORS.ps1`
- [ ] `docker compose ps` (in `backend/`) shows api/worker/reconciler healthy, not restart-looping

## 3. Chat routing matrix (agent tab)

Conventions: **research** = full pipeline run starts (spends credits);
**instant** = answered immediately, $0; **chat** = conversational reply, $0.
Suggestion bubbles never spend — tapping one just sends the shown prompt.

| # | Type this | Expect |
|---|-----------|--------|
| 3.1 | `compare BBCA and BMRI` (both tracked) | research run starts |
| 3.2 | `compare` | clarification + 2 bubbles, $0 |
| 3.3 | `BBCA` | clarification + `research BBCA…` / membership bubbles, $0 |
| 3.4 | `compare BBCA and GOTO` (GOTO untracked) | redirect naming GOTO + `add GOTO` bubble, $0 |
| 3.5 | `research my company` (perspective set) | research scoped to your company |
| 3.6 | `research my company` (perspective NOT set) | clarification asking which company, $0 |
| 3.7 | `bandingkan perusahaanku dengan mandiri` (unset) | one bubble per tracked company (`My company is X`), $0 |
| 3.8 | `my company is TLKM` / `TLKM is my company` / `TLKM adalah perusahaanku` | perspective set to TLKM, $0 |
| 3.9 | `clear my company` / `hapus perusahaan saya` | perspective cleared (neutral), $0 |
| 3.10 | `write python code` / `write python code for BRI` | refusal, $0, no credits touched |
| 3.11 | `What is the largest ocean animal` (live) | refusal, $0 (mock mode: canned fallback instead — expected) |
| 3.12 | `investigate sido` (lowercase) | "Did you mean SIDO?" + `investigate SIDO` bubble, $0 |
| 3.13 | `investigate SIDO` (untracked) | redirect + `add SIDO` bubble, $0 |
| 3.14 | `compare brbi and mandiri` | typo suggestion (BBRI) + bubble with corrected prompt, $0, run does NOT start |
| 3.15 | `reserch on bcca`, `comapre` | typo suggestions, $0 |
| 3.16 | `me and my friend`, `how are you` | normal chat / greeting — never a company suggestion |
| 3.17 | `ada perubahan`, `perusahaanku` alone | never suggests PGAS or any company for grammar words |
| 3.18 | `add BRI` / `tambahkan BRI` | added instantly (or "already monitored"), $0 |
| 3.19 | `remove Telkom` | removed instantly; watchlist never drops below 2, $0 |
| 3.20 | `rename watchlist to Banks` | renamed, $0 |
| 3.21 | `Is BBCA in my watchlist?` | yes/no answer from workspace, $0 |
| 3.22 | `show me my watchlist` / `who is in my watchlist` | listing, $0 |
| 3.23 | `what's new` / `what changed` / `ada yang baru` / `apa yang berubah` | blanket sweep research (spends — this is the explicit ask) |
| 3.24 | `summarize BBCA` / `ringkas TLKM` | research, spends |
| 3.25 | `summary` (bare) | clarification + bubbles, $0 |
| 3.26 | `help` | capabilities incl. status/credits/export/stop/retry/new-chat |
| 3.27 | `status` (idle and mid-run) | correct state + elapsed; works while a run is going |
| 3.28 | `credits` | `used/total` + cache-hit rate, $0 |
| 3.29 | `export` (no completed run yet) | "run one first" clarification, $0 |
| 3.30 | `export` (after a completed run) | `.xls` downloads immediately, $0 |
| 3.31 | `stop` (mid-run / idle) | run stops with cancelled card / "nothing to stop" |
| 3.32 | `retry` (after failure / with nothing failed) | re-runs / "nothing to retry" |
| 3.33 | `new chat` | fresh empty session |
| 3.34 | Reload the page | bubbles on old messages still render and still work |

## 4. Research runs (live)

- [ ] Progress rail walks validate → plan → collect → recover → compare → analyze → persist; tool-call list names **only investigated** companies
- [ ] Scoped compare (`compare my company to ISAT`): comparison table shows **only** those columns; your company gets a ★
- [ ] Blanket sweep (`what's new`): table covers the whole watchlist
- [ ] Company with zero findings is **named** in the summary (`No findings for X: …`), never silently missing
- [ ] First-ever run: summary reports the baseline it established (companies named); feed shows baseline findings with links
- [ ] Repeat run with no changes: "no new findings — previously observed findings are in Signals" (not "financial context only")
- [ ] Comparison table: revenue + earnings + signed YoY % rows; missing cells show `—`; currency shown when known, `units unverified` tag otherwise, full values on hover
- [ ] Ranking sentence appears only when period/currency/unit/scope all match; otherwise no ranking claim
- [ ] `Export XLS`: sections for prompt/summary/scoped table/hypothesis/caveats/signals — no IDs, codes, or credits; empty sections omitted
- [ ] Stop button mid-run → cancelled card; `Retry` on a failed card starts a fresh run
- [ ] Second submit while a run is active → friendly "already running" message and the chat reconnects to the live run (no cryptic 409)

## 5. Watchlist & perspective UI (Competitors tab)

- [ ] Add by ticker/name/industry; at 5 companies further adds are refused with a message
- [ ] Remove; list never drops below 2; removing your own company clears the perspective too
- [ ] Rename works; our-company picker offers Neutral + tracked tickers; ★ marks yours in tables/graphs
- [ ] Reload the page: list, name, and perspective survive (server echo); a failed save toasts and rolls back
- [ ] Competitors tab shows the **line graph** (indexed base-100 revenue momentum, revenue-captioned series only, excluded tickers listed with reason)

## 6. Signals (What-changed tab + detail)

- [ ] Signals tab shows the **comparison table** (latest cited figure, change since first cited, units note)
- [ ] Filters all/new/high/medium/low work; unread dots clear on open; "mark all as seen" works
- [ ] Signal rows and detail titles are clamped (long headlines get `…` + hover text)
- [ ] Detail: 30+ annual-figure rows collapse into one expandable summary; prose facts always visible
- [ ] Detail: bars scale to the series max (not raw percentages); metric cards show the latest period with an "all periods" toggle; giant figures compact (`≈112.01 trillion`), full value on hover
- [ ] Detail: no `Hypothesis: Hypothesis:` doubling; canned fallback sentences hidden (real Qwen/mock prose still shows)
- [ ] `Investigate deeper` starts a new run whose query names that company and finding

## 7. Alerts & Gmail digests

- [ ] `/alerts` shows "Delivery not configured" until env is set; with env set shows masked recipient + severity floor
- [ ] With `ALERTS_ENABLED=true` + App Password + restart: a run that publishes a new/updated high-severity finding sends **one** grouped email; baseline-only and unchanged runs send **nothing**
- [ ] With `SCHEDULED_SWEEP_ENABLED=true`: a sweep is queued once per interval, never overlapping a manual run; the first interval only arms the timer (no surprise spend)
- [ ] Credit math sanity: one full 5-company run ≤ 16 credits; digests themselves cost 0; cached repeats cost less

## 8. Auth & session

- [ ] `/login` accepts the `DEMO_ACCESS_TOKEN`; wrong token is rejected with a message
- [ ] App chrome never loads for signed-out visitors; logout returns to login

## 9. Failure injection `(live)`

- [ ] Stop the API (`docker compose stop api`): dashboard shows error card + Retry; chat answers with its offline fallback
- [ ] Empty `SECTORS_API_KEY` + restart: submitting research fails fast with "no Sectors API key" (no credits touched)
- [ ] Invalid key: run goes `partial` with provider-auth warnings (per-tool failure, never a crashed run)
- [ ] Ollama stopped: run fails with the "local AI model unavailable" message (not a generic error)
- [ ] 5 tracked companies: plan fits, run completes (this exact shape used to crash every run)
- [ ] Same `Idempotency-Key` + same body → same run id; same key + different body → 409
- [ ] Reload mid-run: progress re-attaches to the chat message; switching tabs shows header pill, sidebar dot, and `● Investigating…` browser title
- [ ] `docker compose stop worker` mid-run, then start it: run is fenced and retried or failed explicitly — never stuck silent forever
- [ ] Demo states: `Ctrl+Shift+D` (or `?debug=1`) → Sectors outage, empty feed, failing run, latency, first-visit reset

## 10. Log forensics (when a run fails)

```powershell
cd backend
docker compose ps                                        # all healthy, not restart-looping?
docker compose logs worker | Select-String "run_failed"  # newest line: error_code + error_type + error_detail
docker compose logs --tail=100 worker
docker compose logs --tail=50 api
```

- [ ] Every `run_failed` line carries `error_code` + `error_type` + `error_detail` (never a bare code)
- [ ] Frontend failure card shows `Run #<id> · <CODE>` matching the log line
- [ ] Browser devtools: no zod "returned data this app cannot read" errors on any page (means wire contract matches)

## 11. Sign-off (2-minute smoke)

- [ ] Fresh login → `help` → `what's new` → run completes → table scoped correctly → XLS downloads
- [ ] `compare <two tracked tickers>` → scoped table + ★ + findings list
- [ ] Typo `compare brbi` → suggestion, no spend
- [ ] `investigate sido` → SIDO suggestion; `write python code` → refused
- [ ] Stop a run mid-flight; reload mid-run and watch it resume
- [ ] `/alerts` reflects the server env; no console errors anywhere
