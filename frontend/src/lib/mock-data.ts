import type {
  DashboardAggregates,
  Range,
  RunStep,
  Signal,
  SignalType,
  Watchlist,
} from "./types";

/**
 * The demo dataset.
 *
 * `SEEDED_SIGNALS` is what the feed holds on a first visit. `RESERVE_SIGNALS`
 * is what agent runs discover, one per run — so "new since your last check" is
 * a real statement rather than a re-flagged old row. Everything here is
 * replaced wholesale once `api.ts` points at the backend.
 */

/** The six steps the agent always walks, straight from the concept brief. */
export const RUN_STEPS: RunStep[] = [
  { id: "brief", label: "Understand the brief" },
  { id: "plan", label: "Plan required evidence" },
  { id: "sectors", label: "Retrieve Sectors context" },
  { id: "signals", label: "Collect public signals" },
  { id: "compare", label: "Compare against stored state" },
  { id: "score", label: "Score, explain and store" },
];

export const WATCHLIST: Watchlist = {
  id: "wl-telco-id",
  name: "Telco ID",
  companies: [
    { ticker: "TLKM", name: "Telkom Indonesia", industry: "Telecommunication" },
    {
      ticker: "ISAT",
      name: "Indosat Ooredoo Hutchison",
      industry: "Telecommunication",
    },
    { ticker: "EXCL", name: "XL Axiata", industry: "Telecommunication" },
  ],
};

export const SEEDED_SIGNALS: Signal[] = [
  {
    id: "sig-0142-isat-partnership",
    company: "ISAT",
    companyName: "Indosat Ooredoo Hutchison",
    type: "Partnership",
    title: "Enterprise AI distribution partnership announced",
    subline: "Fact · revenue +12.8% YoY · 3 sources",
    headline: "Indosat announces enterprise AI distribution partnership",
    severity: "high",
    detectedAt: "2026-09-18",
    runId: "0142",
    storedAt: "18 Sep 2026 09:14 WIB",
    comparedAgainstRunId: "0141",
    evidence: [
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Revenue increased 12.8% YoY; EBITDA margin up 210 bps.",
      },
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Industry revenue growth averaged 5.2% over the same period.",
      },
      {
        kind: "observed_signal",
        source: "Press release · product page",
        text: "Press release announcing an enterprise AI distribution partnership; enterprise product page updated the same week.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "Combined with above-industry growth, this may indicate a stronger enterprise market-share push rather than a one-off announcement.",
      },
    ],
    financialContext: {
      seriesCaption: "Quarterly revenue · ISAT vs peer median",
      series: [
        { label: "Q1", value: 34 },
        { label: "Q2", value: 50 },
        { label: "Q3", value: 43 },
        { label: "Q4", value: 78, highlight: true },
      ],
      metrics: [
        { value: "+12.8%", label: "Revenue YoY", accent: true },
        { value: "#2", label: "Market cap rank" },
      ],
      whyItMatters:
        "Enterprise is the segment where our differentiation messaging is weakest. Expect pressure in enterprise pitches next quarter.",
    },
  },
  {
    id: "sig-0142-excl-pricing",
    company: "EXCL",
    companyName: "XL Axiata",
    type: "Pricing",
    title: "Postpaid bundle price reduced on two mid-tier plans",
    subline: "Hypothesis · volume defense after merger",
    headline: "XL Axiata cuts postpaid bundle pricing on two mid-tier plans",
    severity: "medium",
    detectedAt: "2026-09-17",
    runId: "0142",
    storedAt: "17 Sep 2026 09:11 WIB",
    comparedAgainstRunId: "0141",
    evidence: [
      {
        kind: "observed_signal",
        source: "Pricing page diff",
        text: "Two mid-tier postpaid bundles show a lower monthly price than the previous stored snapshot; quota unchanged.",
      },
      {
        kind: "fact",
        source: "Sectors v2",
        text: "ARPU declined 3.1% QoQ while subscriber count grew 1.8%.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "The cut may be a volume defense following post-merger subscriber consolidation rather than a broad repositioning.",
      },
    ],
    financialContext: {
      seriesCaption: "Quarterly ARPU · EXCL vs peer median",
      series: [
        { label: "Q1", value: 62 },
        { label: "Q2", value: 58 },
        { label: "Q3", value: 55 },
        { label: "Q4", value: 48, highlight: true },
      ],
      metrics: [
        { value: "-3.1%", label: "ARPU QoQ", accent: true },
        { value: "#3", label: "Market cap rank" },
      ],
      whyItMatters:
        "Our mid-tier bundle sits directly against these two plans. Sales will meet the new price in renewal conversations within weeks.",
    },
  },
  {
    id: "sig-0141-tlkm-campaign",
    company: "TLKM",
    companyName: "Telkom Indonesia",
    type: "Campaign",
    title: "Campaign messaging shifted toward SME digital services",
    subline: "Observed signal · already reviewed",
    headline: "Telkom shifts campaign messaging toward SME digital services",
    severity: "low",
    detectedAt: "2026-09-14",
    runId: "0141",
    storedAt: "14 Sep 2026 09:08 WIB",
    comparedAgainstRunId: "0140",
    evidence: [
      {
        kind: "observed_signal",
        source: "Campaign landing pages",
        text: "Three campaign landing pages replaced consumer-first copy with SME digital-services messaging.",
      },
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Enterprise and wholesale segment revenue grew 6.4% YoY, slightly above the industry average.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "Messaging may be following an existing revenue mix shift rather than opening a new segment push.",
      },
    ],
    financialContext: {
      seriesCaption: "Quarterly segment revenue · TLKM vs peer median",
      series: [
        { label: "Q1", value: 44 },
        { label: "Q2", value: 47 },
        { label: "Q3", value: 52 },
        { label: "Q4", value: 58, highlight: true },
      ],
      metrics: [
        { value: "+6.4%", label: "Segment YoY", accent: true },
        { value: "#1", label: "Market cap rank" },
      ],
      whyItMatters:
        "SME is a segment we treat as uncontested. If this messaging holds for another quarter, that assumption needs revisiting.",
    },
  },
  {
    id: "sig-0140-isat-pricing",
    company: "ISAT",
    companyName: "Indosat Ooredoo Hutchison",
    type: "Pricing",
    title: "New enterprise pricing tier published",
    subline: "Observed signal · pricing page diff",
    headline: "Indosat publishes a new enterprise pricing tier",
    severity: "medium",
    detectedAt: "2026-09-12",
    runId: "0140",
    storedAt: "12 Sep 2026 09:05 WIB",
    comparedAgainstRunId: "0139",
    evidence: [
      {
        kind: "observed_signal",
        source: "Pricing page diff",
        text: "A fourth enterprise tier appeared above the previous top tier, with connectivity and managed services bundled.",
      },
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Enterprise-linked revenue contributed 18.2% of total revenue, up from 15.9% a year earlier.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "A bundled top tier may be an attempt to move upmarket ahead of the partnership announced later in the month.",
      },
    ],
    financialContext: {
      seriesCaption: "Enterprise revenue share · ISAT vs peer median",
      series: [
        { label: "Q1", value: 40 },
        { label: "Q2", value: 45 },
        { label: "Q3", value: 51 },
        { label: "Q4", value: 64, highlight: true },
      ],
      metrics: [
        { value: "+2.3pp", label: "Enterprise share" },
        { value: "#2", label: "Market cap rank" },
      ],
      whyItMatters:
        "The new tier sets an anchor price above ours. Expect procurement to use it as a reference point in enterprise deals.",
    },
  },
];

/**
 * Discovered by agent runs, one per run, in order. This is what makes the
 * second-run memory demo honest: the feed genuinely grows.
 */
export const RESERVE_SIGNALS: Signal[] = [
  {
    id: "sig-res-excl-cloud",
    company: "EXCL",
    companyName: "XL Axiata",
    type: "Partnership",
    title: "Cloud partnership with a regional data-centre operator",
    subline: "Fact · capex +18% YoY · 2 sources",
    headline: "XL Axiata partners with a regional data-centre operator",
    severity: "high",
    detectedAt: "2026-09-20",
    runId: "0143",
    storedAt: "20 Sep 2026 14:02 WIB",
    comparedAgainstRunId: "0142",
    evidence: [
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Capital expenditure rose 18.4% YoY, the steepest increase among the three tracked operators.",
      },
      {
        kind: "observed_signal",
        source: "Press release",
        text: "Joint announcement covering colocation capacity and a managed-cloud offer aimed at mid-market enterprises.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "Rising capex alongside a colocation deal may signal an infrastructure-led enterprise play rather than a reseller arrangement.",
      },
    ],
    financialContext: {
      seriesCaption: "Quarterly capex · EXCL vs peer median",
      series: [
        { label: "Q1", value: 38 },
        { label: "Q2", value: 44 },
        { label: "Q3", value: 59 },
        { label: "Q4", value: 72, highlight: true },
      ],
      metrics: [
        { value: "+18.4%", label: "Capex YoY", accent: true },
        { value: "#3", label: "Market cap rank" },
      ],
      whyItMatters:
        "Managed cloud is adjacent to our enterprise bundle. If they lead with infrastructure ownership, our partner-based story needs a sharper answer.",
    },
  },
  {
    id: "sig-res-tlkm-fwa",
    company: "TLKM",
    companyName: "Telkom Indonesia",
    type: "Product",
    title: "Fixed-wireless access bundle launched in three cities",
    subline: "Observed signal · product page diff",
    headline: "Telkom launches a fixed-wireless access bundle in three cities",
    severity: "medium",
    detectedAt: "2026-09-20",
    runId: "0143",
    storedAt: "20 Sep 2026 14:02 WIB",
    comparedAgainstRunId: "0142",
    evidence: [
      {
        kind: "observed_signal",
        source: "Product page diff",
        text: "A new fixed-wireless tier appeared with city-level availability copy for Bandung, Surabaya and Medan.",
      },
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Fixed broadband revenue grew 4.1% YoY, below the company's overall growth rate.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "Launching wireless where fixed growth is slowest may be a coverage-cost play rather than a premium product push.",
      },
    ],
    financialContext: {
      seriesCaption: "Fixed broadband revenue · TLKM vs peer median",
      series: [
        { label: "Q1", value: 55 },
        { label: "Q2", value: 57 },
        { label: "Q3", value: 56 },
        { label: "Q4", value: 61, highlight: true },
      ],
      metrics: [
        { value: "+4.1%", label: "Broadband YoY", accent: true },
        { value: "#1", label: "Market cap rank" },
      ],
      whyItMatters:
        "These three cities are where our own expansion roadmap starts next quarter. Expect to meet this bundle in the same pitches.",
    },
  },
  {
    id: "sig-res-isat-campaign",
    company: "ISAT",
    companyName: "Indosat Ooredoo Hutchison",
    type: "Campaign",
    title: "Enterprise case-study campaign running on professional networks",
    subline: "Observed signal · 4 creatives · already reviewed",
    headline: "Indosat runs an enterprise case-study campaign",
    severity: "low",
    detectedAt: "2026-09-21",
    runId: "0144",
    storedAt: "21 Sep 2026 08:30 WIB",
    comparedAgainstRunId: "0143",
    evidence: [
      {
        kind: "observed_signal",
        source: "Campaign creatives",
        text: "Four creatives published, each built around a named enterprise customer outcome rather than a product feature.",
      },
      {
        kind: "fact",
        source: "Sectors v2",
        text: "Enterprise-linked revenue share reached 18.2%, its highest recorded level.",
      },
      {
        kind: "hypothesis",
        source: "Agent interpretation",
        text: "Proof-led creative this early usually follows reference customers being secured, which would make the enterprise push harder to dislodge.",
      },
    ],
    financialContext: {
      seriesCaption: "Enterprise revenue share · ISAT vs peer median",
      series: [
        { label: "Q1", value: 40 },
        { label: "Q2", value: 45 },
        { label: "Q3", value: 51 },
        { label: "Q4", value: 66, highlight: true },
      ],
      metrics: [
        { value: "18.2%", label: "Enterprise share", accent: true },
        { value: "#2", label: "Market cap rank" },
      ],
      whyItMatters:
        "Named-customer proof is exactly what our enterprise deck lacks. This is a content gap before it is a pricing problem.",
    },
  },
];

export const ALL_SIGNALS: Signal[] = [...SEEDED_SIGNALS, ...RESERVE_SIGNALS];

/**
 * Signal-mix colours, ordered. Partnership and Campaign are deliberately far
 * apart in both lightness and hue — two adjacent greys are indistinguishable,
 * especially for colour-blind viewers.
 */
export const MIX_ORDER: SignalType[] = [
  "Pricing",
  "Product",
  "Partnership",
  "Campaign",
];

export const MIX_COLORS: Record<SignalType, string> = {
  Pricing: "#E2650F",
  Product: "#1F1E1C",
  Partnership: "#A9A59D",
  Campaign: "#F3D3BB",
};

/**
 * Only the collection-side figures are fixed here. Everything downstream of
 * "what actually reached the user" — delivered count, mix, severity totals —
 * is recomputed from the live feed in `store.tsx`.
 */
const AGGREGATES: Record<Range, DashboardAggregates> = {
  week: {
    companiesTracked: 3,
    signalsInRange: 0,
    highSeverityCount: 0,
    credits: { used: 312, total: 1000, cacheHitRate: 0.64 },
    pipeline: [
      { label: "Candidates", count: 118, percent: 100, tone: "neutral" },
      { label: "Deduplicated", count: 71, percent: 60, tone: "ink" },
      { label: "Above threshold", count: 17, percent: 14, tone: "ink" },
      { label: "Delivered", count: 0, percent: 0, tone: "accent" },
    ],
    mix: [],
    mixTotal: 0,
    interpretation: {
      body: "ISAT is growing faster than the industry average while expanding into enterprise. Treat the partnership as a positioning threat in enterprise deals, not an isolated announcement.",
      counts: { facts: 2, observedSignals: 1, hypotheses: 1 },
    },
    lastRunAt: "today, 09:14 WIB",
  },
  month: {
    companiesTracked: 3,
    signalsInRange: 0,
    highSeverityCount: 0,
    credits: { used: 312, total: 1000, cacheHitRate: 0.64 },
    pipeline: [
      { label: "Candidates", count: 742, percent: 100, tone: "neutral" },
      { label: "Deduplicated", count: 431, percent: 58, tone: "ink" },
      { label: "Above threshold", count: 96, percent: 13, tone: "ink" },
      { label: "Delivered", count: 0, percent: 0, tone: "accent" },
    ],
    mix: [],
    mixTotal: 0,
    interpretation: {
      body: "Across the month, pricing and product changes dominate the feed while partnership activity concentrates in enterprise. ISAT accounts for the largest share of high-severity signals.",
      counts: { facts: 9, observedSignals: 6, hypotheses: 4 },
    },
    lastRunAt: "today, 09:14 WIB",
  },
};

/** When the next scheduled sweep runs, shown on the idle agent-run card. */
export const NEXT_SCHEDULED_RUN = "tomorrow, 09:00 WIB";

export function aggregatesFor(range: Range): DashboardAggregates {
  return AGGREGATES[range];
}

export const USER = {
  name: "Rizky Pratama",
  role: "Product marketing",
};

/** Past runs. Persisted history is what lets a run reason over change. */
export interface RunHistoryEntry {
  id: string;
  query: string;
  at: string;
  toolCalls: number;
  delivered: number;
  sectorsCalls: number;
}

export const RUN_HISTORY: RunHistoryEntry[] = [
  {
    id: "0142",
    query: "What changed for ISAT in enterprise this week?",
    at: "18 Sep 2026 09:14 WIB",
    toolCalls: 7,
    delivered: 2,
    sectorsCalls: 4,
  },
  {
    id: "0141",
    query: "Weekly sweep · Telco ID",
    at: "14 Sep 2026 09:08 WIB",
    toolCalls: 6,
    delivered: 1,
    sectorsCalls: 4,
  },
  {
    id: "0140",
    query: "Weekly sweep · Telco ID",
    at: "12 Sep 2026 09:05 WIB",
    toolCalls: 6,
    delivered: 1,
    sectorsCalls: 3,
  },
];
