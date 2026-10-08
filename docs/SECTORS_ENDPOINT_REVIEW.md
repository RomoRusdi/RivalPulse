# Sectors v2 endpoint access, costs, and RivalPulse gap-filling plan

## What was verified

All 31 requested Indonesian endpoints are present in Sectors' official v2 documentation and declare positive API-credit costs. Public documentation was fetched without an API key. **No authenticated Sectors request, endpoint entitlement probe, or new investigation was made for this review.**

Three different questions must not be confused:

1. **Documented:** an endpoint exists in the public API reference.
2. **Account entitlement:** this account's subscription/key is allowed to call it.
3. **Credit cost:** an allowed request consumes credits according to the documented billing rules.

The documentation's [Get your API Key guide](https://docs.sectors.app/get-started/v2/overview) advertises API access for **Insider subscribers**. It does not provide an endpoint-by-endpoint Forever Free entitlement matrix. Both ordinary HTTP retrieval and a normal browser visit to the [pricing page](https://sectors.app/pricing) reached a Vercel Security Checkpoint, not the current pricing table. Therefore the exact free-plan allowance and permissions remain **unverified**. An included allowance or promotional credit is not the same as a zero-credit endpoint.

The user's previously saved live Company Reports establish that that endpoint was accessible when those reports were collected. They do not establish access to the other 30 endpoints or the account's current credit balance.

## Complete cost matrix

All paths below are GET requests relative to `https://api.sectors.app`. Costs are documented nominal credit costs, not verified account entitlements or the user's actual bill. Request counts, retries, pagination, returned quarters, and selected sections can increase a workflow's total.

| # | Requested endpoint | v2 path | Documented credit cost | RivalPulse relevance |
|---|---|---|---|---|
| 1 | Companies Screener | `/v2/companies/` | **1** for structured `where`/`order_by`; **3** for natural-language `q` | High: candidate batched, year-specific financial enrichment and company discovery |
| 2 | Company Report | `/v2/company/report/{symbol}/` | **1 per section**; all 8 by default = **8** | High: annual statements, reported margins, latest-quarter/TTM growth, company identity |
| 3 | Company Quarterly Financials | `/v2/financials/quarterly/{symbol}/` | **1 per quarter returned** | High: dated quarterly financial context, subject to period/basis checks |
| 4 | Quarterly Financial Dates | `/v2/company/get_quarterly_financial_dates/{symbol}/` | **1** | High: valid report dates and quarter labels for one company |
| 5 | Latest Quarterly Financial Dates — Universe | `/v2/companies/quarterly-financial-dates/` | **1 per page**; documentation estimates ~32 pages for a full sweep | Later: incremental freshness polling using `since`; avoid a full-universe sweep for five companies |
| 6 | Company Revenue Segments | `/v2/company/get-segments/{symbol}/` | **1** | High for segment/product/geography context where available |
| 7 | Companies with Revenue Segments | `/v2/companies/list_companies_with_segments/` | **1** | High: cache availability/years before asking for unavailable segment records |
| 8 | Shareholders Composition | `/v2/company/shareholders-composition/{symbol}/` | **1** | Optional ownership context; monthly categories, not revenue or profit |
| 9 | Corporate Actions | `/v2/company/corporate-actions/{symbol}/` | **1** | Useful event context: dividends, splits, rights issues, AGM, etc. |
| 10 | Corporate Actions Calendar | `/v2/corporate-actions/` | **1 per requested type**; all 7 types by default = **7** | Useful event windows; narrow the requested types |
| 11 | Daily Transaction Data | `/v2/daily/{symbol}/` | **1** | Optional stock-price/volume context, not business revenue growth |
| 12 | Daily Full-Universe Close | `/v2/close/` | **1 per page**; documentation estimates ~32 pages for a full pull | Not needed to fill current financial-comparison gaps |
| 13 | IDX Market Summary | `/v2/idx-total/` | **1** | Optional market-cap context |
| 14 | Index Daily Transaction Data | `/v2/index-daily/{index_code}/` | **1** | Optional market/index benchmark, not financial statements |
| 15 | Daily Full-Universe Index Close | `/v2/index-daily/` | **1** | Optional market overview |
| 16 | Top Company Movers | `/v2/companies/top-changes/` | **1 per classification × period**; default 2 × 5 = **10** | Optional share-price context; request only the needed combination |
| 17 | Most Traded Stocks | `/v2/most-traded/` | **2** | Investor/trading attention, not operating performance |
| 18 | Company IPO & Listing Performance | `/v2/listing-performance/{symbol}/` | **1** | Optional IPO/price context; coverage limited to listings after May 2005 |
| 19 | News Articles | `/v2/news/` | **1 per request/page** | High: evidence of recent company events; IDX/mining extensions have different filters |
| 20 | Company Filings | `/v2/filings/` | **1 per request/page** | Insider/major-holder buy/sell transactions; **not a general annual-report/earnings-filings archive** |
| 21 | Stock Suspensions | `/v2/suspensions/` | **1 per request/page** | Useful suspension/risk events, not financial-statement replacement |
| 22 | Broker Activity by Code | `/v2/broker-activity/{broker_code}/` | **1** | Investor/trading flow; not needed for current financial gaps |
| 23 | Broker Activity per Symbol | `/v2/broker-summary/{symbol}/` | **1** | Investor/trading flow; not revenue/earnings |
| 24 | Top Buyers and Sellers per Symbol | `/v2/broker-summary/{symbol}/top/` | **2** | Investor/trading flow |
| 25 | Top Accumulations and Distributions per Broker | `/v2/broker-activity/{broker_code}/top/` | **2** | Investor/trading flow |
| 26 | Broker Registry | `/v2/brokers/` | **1** | Supporting broker reference; cache if a broker feature is introduced |
| 27 | Top Brokers Daily Ranking | `/v2/brokers/top/` | **2** | Broker activity, not company operating performance |
| 28 | Daily Net Foreign Inflow | `/v2/foreign-flow/{symbol}/` | **1** | Optional investor-origin flow, explicitly IDR |
| 29 | Daily Full-Universe Foreign Flow | `/v2/foreign-flow/` | **1 per page**; documentation estimates ~20–25 pages for a full universe | Avoid for a small competitor watchlist |
| 30 | Free Float Market Analysis | `/v2/free-float/` | **1 per 100 companies returned, rounded up** | Ownership/liquidity context; “free float” does **not** mean a free API |
| 31 | Subsector Report | `/v2/subsector/report/{sub_sector}/` | **1 per section**; all 6 by default = **6** | Potential same-subsector peer context; request only necessary sections |

The complete official [documentation index](https://docs.sectors.app/llms.txt) links to the individual descriptions for every row. [Full documentation](https://docs.sectors.app/llms-full.txt) includes each cost declaration. Useful primary sources:

- [Companies Screener](https://docs.sectors.app/api-references/v2/indonesia/screener/companies)
- [Company Report](https://docs.sectors.app/api-references/v2/indonesia/report/company-report)
- [Quarterly Financials](https://docs.sectors.app/api-references/v2/indonesia/report/quarterly-financials)
- [Quarterly Dates](https://docs.sectors.app/api-references/v2/indonesia/helper-list/company-quarterly-dates)
- [Latest Quarterly Dates — Universe](https://docs.sectors.app/api-references/v2/indonesia/helper-list/latest-quarterly-dates)
- [Revenue Segments](https://docs.sectors.app/api-references/v2/indonesia/report/company-segments)
- [Segment Availability](https://docs.sectors.app/api-references/v2/indonesia/helper-list/companies-segments-list)
- [News](https://docs.sectors.app/api-references/v2/indonesia/news/news)
- [Company Filings](https://docs.sectors.app/api-references/v2/indonesia/news/filings)
- [Subsector Report](https://docs.sectors.app/api-references/v2/indonesia/report/sector-report)
- [Billing changelog](https://docs.sectors.app/api-references/v2/changelog)

## Billing traps

The OpenAPI billing description and the July 31, 2026 changelog state:

- **2xx:** consumes the endpoint's stated credits. Empty list/filter results are valid `200` responses and are still billed.
- **404:** consumes **1 credit**, even though the specific addressed resource was not found.
- **400:** generally free, except the screener's natural-language mode can consume **1 credit** when the model was already invoked before a failure.
- **401/403, 429, 5xx:** not billed according to the published policy.
- Current machine-readable diagnostics include `subscription_does_not_allow`, `subscription_not_active`, `monthly_limit_exceeded`, `insufficient_credits`, and `service_unavailable`.

These rules are not permission to test arbitrary URLs or manufacture errors to infer access. Check the provider account dashboard/support for entitlements first; bound any approved live validation.

RivalPulse's internal credit reservations are **not** proof of the actual Sectors balance or final billing. A workflow budget must count sections, pages, quarters, and ranking combinations, not just HTTP requests.

## Which endpoints can address the actual missing fields?

### 1. Annual net margin: solved using existing evidence

`Company Report → financials → historical_financial_ratio → profitability.net_profit_margin` already supplies a year-specific reported ratio in the user's saved reports. RivalPulse now projects it into the comparison with a saved-snapshot citation and converts the documented fractional rate to percent.

No additional endpoint or paid investigation is needed to re-display those existing margins. Unverified reporting scope still prevents a like-for-like rank; availability and comparability are separate.

### 2. Annual revenue growth: investigate the structured screener first

The [screener field reference](https://docs.sectors.app/api-references/v2/indonesia/screener/companies) explicitly documents:

- `revenue[YYYY]`: annual revenue in IDR.
- `earnings[YYYY]`: annual net profit/loss in IDR.
- Year-specific `net_profit_margin[YYYY]` and other profitability ratios.
- Arithmetic expressions on fields and years.
- Quarterly bracket fields such as `revenue_q[Q1-2024]`, explicitly denominated in IDR.

A single **structured**, symbol-filtered page may be enough for the whole scoped watchlist, including the independent own-company perspective. This is the best candidate for a **one-request, one-credit validation**, rather than one request per company. Returned fields, `query_values` structure, missing-field behavior, and account access still need validation; the docs' broad response schema does not prove a particular response will contain every field.

Requirements before deriving or ranking annual growth:

- Get both adjacent years and match symbols and actual years exactly.
- Attach endpoint-specific documented currency/unit provenance; do **not** retroactively stamp old Company Report snapshots as IDR just because a different endpoint documents IDR.
- Verify reporting basis and merger/restatement boundaries. Documentation of currency alone does not establish consolidated versus standalone comparability.
- Keep a missing/nonpositive base or incompatible period/basis explicit.
- Retain the original figures, sources, and calculation formula.
- If basis remains unverified, keep comparable annual growth withheld; do not silently relabel a different ratio as annual growth.

### 3. Reported quarterly/TTM growth: useful context, not an annual replacement

The existing Company Report financials section already documents latest-quarter and trailing-twelve-month revenue/earnings growth. These may already be present in saved payloads, so inspect cached evidence first.

They can be shown in separate, correctly labelled fields such as **Quarterly revenue YoY — provider reported** and **TTM revenue YoY — provider reported**. Do not overwrite **Annual revenue growth** with either. Where a reference quarter/end date is missing, say so and do not rank the figures as same-period observations.

### 4. Dated quarterly performance: quarterly financials plus date discovery

Quarterly Financials documents dated revenue, earnings, assets, equity, and operating cash flow in **IDR**. The date helper supplies valid report dates and quarter labels.

This can address quarterly-history/period gaps, but a quarterly result cannot stand in for an annual result. Confirm standalone-quarter versus cumulative/YTD basis before calculating quarter-on-quarter or year-on-year changes. Match actual returned dates; the endpoint defaults `approx=true`, so approximate matching must not silently change the requested comparison period.

Costs scale with returned quarters. An illustrative per-company flow of one date-helper request plus one exact current-quarter request plus one exact prior-year-quarter request is **nominally 3 credits if each financial request returns one quarter**. Five companies would be 15 credits, before other work. This is **not a measured bill or an approved request plan**. Explicitly constrain requests and validate response cardinality before integrating them.

### 5. Segment gaps and possible profit drivers: segment availability then detail

The segment-availability endpoint reports covered companies and available financial years. Cache that lookup; fetch detail only for a covered company/year when the user asks for segment context.

Revenue Segments documents segment node values in IDR. It can support disclosed revenue/cost mix and product/geography discussion, not an automatic claim that a campaign or product launch caused profit to change. Coverage is explicitly incomplete across companies.

### 6. Recent activity: news and corporate actions, where requested

Use bounded, symbol/date-filtered News Articles for relevant dated company events. Corporate Actions adds documented dividends, splits, rights issues, AGM, and other actions. Suspensions can add explicit risk events.

These are different investigation capabilities. A financial-only question should not silently trigger extra event requests to replace “not investigated” with a guessed absence. Empty news results do not prove no competitive change; corporate actions do not establish all product/pricing/campaign activity.

### 7. Peer ranks: compatible peers and evidence, not more random data

Company Report's `peers` section and Subsector Report's `companies`/statistics sections can help identify relevant peer context. Keep the user's own-company perspective separate from watchlist membership. Suggest appropriate competitors without silently adding unapproved companies to paid research scope.

For the user's ICBP-versus-banks-and-telecoms example, extra API calls cannot make those companies a valid consumer-goods peer group. Cross-sector references should remain unranked.

### What should not fill financial gaps

Price changes, trade volume, broker accumulation, foreign inflow, shareholder percentages, free float, and IPO performance are different measurements. They cannot substitute for revenue growth, net margin, profit, or missing statement metadata. “Company Filings” here is specifically an insider-transactions endpoint, not a general earnings-release archive.

## Recommended implementation order

1. **Saved evidence first:** reuse reported annual margins and properly labelled quarterly/TTM rates already available; no new Sectors request.
2. **One approved structured screener validation:** at most one nominal 1-credit request, with fixed symbols and explicit years; inspect account permissions and returned financial fields.
3. Add an endpoint-specific adapter, cost estimator, caching, citation provenance, and synthetic fixtures only for validated fields. Keep unknown basis/coverage truthful.
4. Add bounded quarterly dates/financials only for a user-requested quarterly investigation with an explicit additional budget.
5. Add cached segment availability/detail and relevant event sources only for questions that need them.
6. Defer market-wide price feeds, broker rankings, and foreign-flow sweeps unless RivalPulse gains a product requirement for trading analysis.

**No new endpoint integration or live probe was performed in this review.** More endpoints can reduce genuine coverage gaps, but cannot guarantee that every field becomes available or comparable. Never fill a missing cell with a different metric or fabricated metadata merely to remove the word “Unavailable.”
