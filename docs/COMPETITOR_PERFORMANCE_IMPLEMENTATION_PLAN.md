# Competitor Performance Snapshot — implementation plan

Prepared 6 October 2026 (WIB). Scope: the Revenue Momentum section on the Competitors page. The implementation described below is now present in the application; the findings record the original diagnosis. Provider request sections and account settings remain unchanged.

## Recommendation

Replace the default shared Revenue Momentum chart with **Competitor Performance Snapshot**: one row or card per watched company, presenting the financial facts actually returned by Sectors. Prefer provider-reported quarterly revenue growth, quarterly earnings growth, and annual net profit margin when present. Always retain available annual revenue and earnings with their reporting years and source links. Offer the existing annual comparison chart only when its requirements are satisfied.

Suggested subtitle: **“Reported growth, profitability, and financial scale to support competitor research.”**

This supports RivalPulse's purpose in the [project README](../README.md): combine financial evidence and public competitive signals to explain what changed and why it may matter to marketing and strategy teams. Financial performance supplies business context for researching positioning, products, pricing, and partnerships. It does not establish what caused growth or how much a competitor spends on marketing.

## Findings and confidence

| Finding | Evidence | Conclusion |
| --- | --- | --- |
| Revenue was returned for at least one company. | The supplied screenshot contains BBCA annual values for 2018–2023. | This is not an entirely empty financial response. The screenshot does not establish complete coverage for every company. |
| The application rejects unverified monetary comparisons. | `backend/app/providers.py:normalize_report` leaves absent currency, unit, and scope unknown. `backend/app/financial_feed.py:verified` excludes these points. | This directly explains the screenshot's “comparison unavailable” state. |
| Useful response fields are discarded. | The current normalizer retains five annual monetary metrics, overview, and peers; it does not retain quarterly growth or annual profitability ratios. | These fields are candidates for the replacement if the account's actual payload includes them. |
| The UI continues to advertise a chart when it cannot draw one. | `frontend/src/components/dashboard/RevenueTrendGraph.tsx` defaults to indexed mode, disables both controls when neither comparison is possible, and repeats missing-data messages. | The presentation should change according to available evidence. |
| Error handling cannot reliably identify subscription restrictions. | `Sectors._http` groups 401 and 403 as authentication failure; exhausted 429 retries become a generic provider error. | Preserve diagnostic distinctions before attributing missing data to the plan. |
| Annual growth policy differs between surfaces. | `providers.growth` requires known metadata; `research.yoy_percent` accepts equal unknown metadata. | Make the rule consistent across the snapshot, source viewer, and newly generated research briefs. |

**Working diagnosis:** the displayed failure is explained by missing reporting metadata and a strict comparison gate. A subscription restriction, omitted field, parser mismatch, or provider error may also exist, but none is established for this account by the screenshot alone.

The [Sectors v2 company-report documentation](https://docs.sectors.app/api-references/v2/indonesia/report/company-report) includes annual financials, annual profitability ratios, and quarterly revenue/earnings growth. Its sample omits explicit monetary currency, unit, reporting scope, and a quarter reference for those growth fields. It charges one credit per requested section. These are documented capabilities, not verified Forever Free entitlements.

The [public API introduction](https://docs.sectors.app/get-started/v2/overview) describes Insider access. An account-specific Forever Free endpoint matrix and recurring credit allowance could not be verified from the accessible public pages. Treat the user's Forever Free subscription as context, and verify its actual API access rather than assuming either unrestricted access or no access. No authenticated provider request was made while preparing this plan.

## Target experience

Default content, in this order:

1. Company identity, “your company” marker, business classification when stored, and a source freshness label.
2. Available provider-reported revenue growth and earnings growth, labeled **quarterly YoY**; annual net profit margin, labeled with its own year.
3. Latest available annual revenue and earnings, each with its own year. When monetary metadata is missing, use a compact number followed by **“units as reported”**, with **“Currency and reporting scale not supplied”** visible nearby.
4. One concise business-context observation and an action to investigate relevant public competitive signals.
5. Expandable annual history and an accessible source viewer retaining exact values and reporting caveats.

For example, a raw value of `63028090000000` can appear as **“≈63.03 trillion units as reported · FY2018”** with the exact number available in the source view. Do not prepend `Rp` or treat the display scale “trillion” as evidence of a provider reporting unit.

| Available evidence | Primary presentation | Comparison behavior |
| --- | --- | --- |
| Provider growth/ratios plus annual figures | Performance cards or rows and annual history | Compare only metrics with matching verified periods and compatible definitions. |
| Provider growth without a quarter reference | Individual value with “Provider-reported quarterly YoY; quarter not supplied” | No quarter label inferred from retrieval time; no ranking or shared-period chart. |
| Annual values with unknown monetary metadata | Latest annual figures and compact annual history | No calculated monetary YoY, indexed line, or monetary ranking. |
| Verified annual series but no shared base year | Individual annual histories; annual YoY where valid | Do not invent a common base year. |
| Verified comparable annual series with a common base | Optional “Annual revenue comparison” view | Retain indexed growth and reported-value views with explicit included companies and periods. |
| Financial section inaccessible but profile exists | Compact “Company context” fallback using stored classification, description, and website | Explain that financial access needs attention once; do not substitute stock-price movement for business growth. |
| Some companies have no report | Keep covered companies visible; show a reason and research action for uncovered companies | Coverage is per company; partial coverage does not empty the entire section. |
| No useful stored report | A clear empty/error state with the appropriate action | Distinguish not collected, access denied, quota exhausted, and temporary failure. |

Hide metric columns that have no values anywhere. For a missing value in an otherwise useful column, use “Not supplied” with its specific reason. Remove repeated “comparison unavailable” legends and chart instructions when no chart is shown. An actual lack of data must remain visible; this change must not manufacture a replacement value.

## Data and interpretation rules

- Preserve exact provider numbers as decimal strings. Accept zero and negative valid growth/margin values; reject booleans and non-finite values. Missing and null are not zero.
- Keep provider-reported metrics separate from RivalPulse-computed metrics. Displaying a provider's percentage does not require inventing a monetary currency; it does require identifying the metric's origin and limitations.
- Confirm the documented percentage encoding against saved payloads. Convert supported fractional rates to displayed percentages exactly once using Decimal, with two decimal places. Retain the raw value and conversion in provenance. Do not guess encoding from magnitude.
- Store a metric's period separately from `fetchedAt`. Annual margin uses the ratio row's year. A missing quarter stays null; never use the current quarter, latest annual year, or stock-price date as a substitute.
- Computed annual YoY requires adjacent annual years, a positive prior value, verified consistent currency, unit, and scope, and no unaccounted merger boundary. Indexing requires a positive shared base value within a comparable segment.
- Make comparison eligibility distinct from display eligibility. A valid sourced value can remain visible even when comparison is blocked. Monetary rankings additionally require matching periods, compatible business definitions, and an explicitly identified cohort.
- Treat BBCA, SIDO, and telecom companies as a mixed watchlist, not an automatically valid peer group. Label cross-industry context and do not infer market share, organic growth, or competitive leadership from their raw revenue values.
- Preserve EXCL merger/scope notes. Provider growth can still be shown as reported with a scope caveat, but must not be interpreted as organic growth without supporting evidence.
- Explain freshness relative to the source's retrieval/cache policy; an annual report's year is not its retrieval date. If a newer collection failed, show the retained historical snapshot's date and an explicit refresh-failure notice.
- Use cautious business language: “Review recent positioning and partnership signals.” Do not claim that revenue growth proves campaign success, marketing budget, customer acquisition, or future strategy. Any suggested explanation remains an evidence-linked hypothesis.

## Implementation sequence

### 1. Audit stored payloads and classify the cause

Inspect workspace-authorized live Sectors snapshots for BBCA, EXCL, ISAT, SIDO, and TLKM where available. Compare `raw_payload` against `normalized`; do not spend credits just to rediscover fields already stored.

Produce a small field-coverage matrix: company, endpoint/sections, HTTP or recorded collection outcome, relevant fields present/null/absent, monetary metadata, annual years, quarter reference, and retrieval date. Use recorded responses and account entitlement information to distinguish:

- Access restriction confirmed by a provider error or account entitlement.
- Credit exhaustion or rate limit confirmed by the response.
- Successful response with absent metadata or absent metric.
- Successful response with a field discarded or misread by RivalPulse.
- Invalid payload, identity mismatch, or transport/server failure.

Do not label a generic 403 as “upgrade required.” Preserve bounded, allowlisted error details without keys or sensitive response content. Unknown access remains unknown. If further verification needs a request, use the existing bounded research workflow and its configured credit checks.

**Completion criterion:** account-specific availability is recorded; the implementation has a working annual-values fallback even if all optional metrics are absent.

### 2. Add a versioned financial performance projection

Add `backend/app/financial_projection.py` as a pure, bounded projection shared by the normalizer, feed, and source viewer. Retain the existing annual monetary `metrics` contract and add a separate `performance_metrics` collection so periodless quarterly values cannot break existing annual-period selection.

Candidate input paths, subject to the audit:

| Metric | Provider path | Period |
| --- | --- | --- |
| Annual revenue / earnings | `financials.historical_financials[i].revenue` / `.earnings` | Row `year` |
| Quarterly revenue growth | `financials.yoy_quarter_revenue_growth` | Explicit quarter reference only if supplied |
| Quarterly earnings growth | `financials.yoy_quarter_earnings_growth` | Explicit quarter reference only if supplied |
| Annual net profit margin | `financials.historical_financial_ratio[i].profitability.net_profit_margin` | Ratio row `year` |

Each projected metric carries `metric`, `rawValue`, display `value`, `unit`, `periodKind`, nullable `period`, `origin`, nullable monetary metadata, `snapshotId`, `jsonPointer`, `sourceUrl`, `fetchedAt`, `transformation`, `displayStatus`, `comparisonStatus`, and reason codes. Suggested origins: `provider_reported` and `computed_verified`. Suggested reasons: `not_supplied`, `metadata_missing`, `period_unknown`, `scope_change`, `conflicting_values`, and `mixed_business_definitions`.

Apply field-level validation: a malformed optional ratio must not discard valid annual revenue. Fail closed on company identity mismatch or an unusable report structure. Limit projected rows to the application's supported response bound. Handle duplicate/conflicting periods explicitly.

For existing immutable snapshots, project additional fields from authorized `raw_payload` at read time; never overwrite snapshots or completed research results. When raw payload is absent, retain the available legacy annual metrics. New snapshots use an incremented parser/schema version. Version cache keys deliberately, while allowing the pure projection to reuse compatible historical evidence without a forced paid refetch.

**Completion criterion:** existing stored reports immediately yield all valid supplied fields; provenance resolves to the original values; unknown metadata remains unknown.

### 3. Extend the read-only API and synchronize contracts

Extend `GET /api/v1/watchlists/{watchlist_id}/financials` additively. Retain `companies`, `points`, `baseYear`, `absoluteAvailable`, and `mode` for compatibility. Add per-company `performanceMetrics`, `coverage`, `freshness`, and the latest recorded collection status. Add `projectionVersion` and explicit `comparisonEligibility` with included/excluded companies and reasons.

Keep `coverage` separate from `collectionStatus`: a company can have historical data and a failed latest refresh. Select the newest useful authorized snapshot deterministically; optional sections must not erase a richer financial report. Do not silently assemble incompatible fields from unrelated periods or snapshots.

Update Pydantic models in `financial_feed.py`, `frontend/src/lib/schemas.ts`, types/API helpers, mock fixtures, and exported OpenAPI examples together. Extend the financial source viewer for percentage metrics, unknown quarters, raw values, and transformation details; its current annual-only model cannot represent all new metrics.

Keep account/workspace ownership and live/replay isolation on both endpoints. Reading this section or a source viewer must make zero Sectors requests.

Use one shared comparison policy for this feed and newly generated financial briefs. Replace the permissive unknown-metadata arithmetic in `research.yoy_percent` with that policy, updating its relevant tests and user wording. Previously published research remains immutable.

**Completion criterion:** the frontend can render each coverage scenario without inventing values or triggering provider calls.

### 4. Replace the default component and connect the research workflow

Create `frontend/src/components/dashboard/CompetitorPerformanceSnapshot.tsx` and use it in `frontend/src/app/(app)/watchlists/page.tsx`, which implements the Competitors screen. Refactor `RevenueTrendGraph.tsx` into the optional verified annual view, removing its fetch duplication if the parent already has the feed.

Use a compact table on desktop and company cards on mobile. Keep company order and the user's company marker consistent with the watchlist. Display reporting periods on each metric, source links, a concise coverage message, and accessible expanding history. Use neutral directional labels such as “reported growth” or “reported decline”; avoid turning them into threat scores.

Show comparison controls only for available comparison modes. Make excluded companies and the chosen base year visible when comparing a subset. Preserve broken lines for missing years/scope boundaries, keyboard inspection, and the exact source table. Charts must not imply that every watchlist company participates.

The “Investigate competitive signals” action opens the existing agent flow with the company and a suggested question. It must not automatically launch a paid investigation from a page render. Example: “Review TLKM's recent product, pricing, and partnership signals alongside its reported financial performance.” The financial snapshot can use deterministic context when AI interpretation is absent; do not add a model call to every page load.

**Completion criterion:** a successful report produces useful primary content even with zero comparable annual series.

### 5. Refine provider outcomes and verify the complete flow

In `providers.py`, `errors.py`, and the relevant UI error formatter, distinguish authentication failure, confirmed access restriction, confirmed quota exhaustion, rate limiting, invalid response, and temporary failure. Honor a valid bounded `Retry-After`; do not repeatedly retry non-retryable access/quota failures. Leave unrecognized failures generic rather than inventing a tier diagnosis.

Continue collecting other companies when one company fails, within the existing research budget. Retain previous financial evidence as explicitly dated historical evidence; do not silently treat expired data as a successful fresh fetch or a new baseline.

Keep existing `overview,financials` requests for the first implementation. The replacement should need no additional endpoint or report section when those payloads already include its fields. Five cold company reports with these two sections have a base cost of ten credits, before retries or other research tools. The existing server limits still govern total spend. A later financials-only optimization requires checking the agent's dependence on overview; it is not necessary for this change.

## Verification and acceptance criteria

Extend meaningful backend coverage in `test_providers.py`, `test_financial_feed.py`, and `test_financial_brief.py`, plus API/source-viewer access tests:

- Payload with revenue but missing currency/unit/scope renders annual figures, blocks calculated comparisons, and does not block supplied dimensionless metrics.
- Fraction-to-percent conversion happens once; zero, negative, very large valid rates, null, boolean, and malformed values behave correctly.
- A missing quarter reference remains null and blocks quarter rankings. Different annual years are never presented as one shared period.
- Optional fields absent or malformed do not erase valid monetary facts. Duplicate conflicting years remain visible as conflicts.
- Gaps, nonpositive bases, changed currencies/units, merger boundaries, and mixed business definitions reject the affected comparison while preserving source values.
- Partial company failure, 401, confirmed access restriction, quota exhaustion, 429, timeout, and 5xx produce distinct appropriate states and bounded retries.
- Legacy snapshots work without mutation or paid refetch. Source pointers resolve; percentage transformations can be inspected.
- No provider call occurs during feed/source browsing. Workspace boundaries, mode isolation, and deterministic snapshot selection remain intact.

Run the targeted backend tests, then frontend lint/type checking and a production build. Regenerate and validate the API contracts. Verify the actual screen at desktop and 390-pixel mobile width, with keyboard navigation and the coverage states above. Use controlled fixtures for error states and a stored live payload for fidelity; a live refresh is only needed to resolve an account-access uncertainty remaining after the audit.

The change is ready when a metadata-limited successful report no longer lands on a disabled chart, every displayed value has a source and explicit period status, optional metrics work within the account's demonstrated access, valid companies remain visible during partial failure, and the snapshot leads naturally to RivalPulse's cited competitive research.

## Delivery order and scope

Ship first: field audit, compact annual-values fallback, shared projection, performance metrics, source-viewer support, consistent comparison policy, and the replacement UI. Finish the relevant error classifications and verification in the same change.

Defer: quarterly-history/segment endpoints, analyst forecasts, stock-price panels, automatic new alerts, composite competitor scores, and provider upgrades. These require separate product justification and confirmed account capabilities; they are not needed to fix the current section.

Estimated effort for one engineer: **3–4 working days**, assuming saved payloads are available and no provider schema changes are needed. Sequence: audit and contract design; backend projection/API; UI and source viewer; verification and polish. Account verification is the main uncertainty, while the annual-values fallback can proceed independently.

## Implementation status

Implemented: read-time projection of saved reports; exact fractional-rate provenance; additive API contracts; a desktop performance table and mobile cards; annual-values fallback for missing metadata; optional verified charts; annual history and percentage source views; categorized collection outcomes and bounded retry delays; and research prompts that prefill without submitting. Saved evidence is retained during failed refreshes, and newly generated briefs share the verified annual growth policy.

Verification: the complete backend unit suite passed (169 tests before the additional Retry-After date test); all 13 provider tests then passed with that test included. Frontend lint, TypeScript checking and production build passed. A synthetic browser preview verified missing monetary metadata, three covered companies in a five-company mixed watchlist, a rate-limited refresh with retained evidence, raw fractions and source pointers, research draft prefilling, keyboard expansion of annual history, and mobile cards at 390 pixels without page overflow. A verified replay scenario confirmed both annual chart modes, explicit exclusion of a merger-affected indexed series, and keyboard year inspection. The preview did not connect to Sectors or alter account/workspace history.

Limitation: no live saved payload was available in the local database and no authenticated Sectors request was made. Actual Forever Free entitlements remain unverified. The UI uses only fields supplied in stored reports, hides wholly absent optional metric columns, and preserves the annual-values fallback independently of those entitlements.
