const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-09-18" -> "18 Sep". Parsed by hand to keep it timezone-stable. */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/** "2026-09-18" -> "18 Sep 2026". */
export function longDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function findingDate(stamp?: string, zone = "Asia/Jakarta", fallback = "") {
  if (stamp && /^\d{4}-\d{2}-\d{2}$/.test(stamp)) return longDate(stamp);
  if (!stamp || !Number.isFinite(new Date(stamp).getTime())) return longDate(fallback);
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "numeric", month: "short", year: "numeric" }).format(new Date(stamp));
}

export function sourceHref(value: string): string | null {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

/** Shared labels for dashboard reporting ranges. */
export const RANGE_LABEL = {
  week: "This week",
  month: "This month",
} as const;

/** ISO timestamp -> compact dashboard time; preserve already-friendly copy. */
export function dashboardTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function runFailureMessage(code?: string): string {
  switch (code) {
    case "LLM_INVALID_OUTPUT":
      return "The AI response did not pass evidence validation. No unsupported findings were published; retry the investigation.";
    case "LLM_UNAVAILABLE":
      return "The AI service is temporarily unavailable. Try again later; contact your administrator if this continues.";
    case "LLM_NOT_CONFIGURED":
      return "AI research is unavailable for this workspace. Contact your administrator for assistance.";
    case "LLM_BUDGET_EXCEEDED":
      return "The run used up its AI call budget before finishing. Retry with a narrower question.";
    case "PROVIDER_CREDENTIALS_MISSING":
    case "PROVIDER_AUTH_FAILED":
      return "The research data connection needs attention. Contact your administrator before trying again.";
    case "PROVIDER_ACCESS_DENIED":
      return "Sectors denied access to the requested data. Check the API account’s access; stored evidence is retained.";
    case "PROVIDER_QUOTA_EXHAUSTED":
      return "The Sectors API credit allowance is exhausted. Stored evidence is retained; check the API account before retrying.";
    case "PROVIDER_RATE_LIMITED":
      return "Sectors limited the request rate. Wait a moment before retrying; stored evidence is retained.";
    case "PROVIDER_UNAVAILABLE":
    case "PROVIDER_REQUEST_REJECTED":
      return "Sectors could not serve the request. Wait a moment, then retry — collected evidence is kept.";
    case "PROVIDER_INVALID_RESPONSE":
      return "The data service returned information we couldn’t verify. Try again later.";
    case "RESPONSE_TOO_LARGE":
      return "A provider response exceeded the size limit. Retry with a narrower question.";
    case "CREDIT_BUDGET_EXCEEDED":
    case "TOOL_BUDGET_EXCEEDED":
      return "The run hit its Sectors credit or request budget. Cached evidence is kept — retry a smaller question.";
    case "CACHE_UNAVAILABLE":
      return "A research service is temporarily unavailable. Wait a moment and try again.";
    case "UNSUPPORTED_MODE":
      return "This run used a retired provider mode. Start a new investigation instead of retrying.";
    case "RUN_INTERRUPTED":
    case "WORKER_INTERRUPTED":
      return "Research was interrupted before it could finish. Start a new investigation to try again.";
    case "CANCELLED":
    case "cancelled by user":
      return "This investigation was stopped. No new findings were published.";
    case "RUN_TIMEOUT":
      return "The investigation exceeded its time limit. Retry a narrower question.";
    case "run stream":
      return "Live updates are unavailable. Refresh the page to check the investigation’s current status.";
    case "INTERNAL_ERROR":
      return "Research could not finish because of a service error. Try again; contact your administrator if this continues.";
    default:
      return "The investigation could not finish. No unsupported findings were published; you can retry.";
  }
}

/** Seconds -> "00:42". */
export function clock(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const m = Math.floor(wholeSeconds / 60);
  const s = wholeSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Compact a large absolute figure ("112006326000000 provider_native_unspecified"
 * -> "≈112.01 trillion units as reported"). Anything that is not a
 * plain large number (percentages, ranks, short values) passes through
 * untouched, with the full original kept in the caller's title attribute.
 */
export function compactFinancial(raw: string): string {
  const structured = /^([+-]?[\d.,]+)\s+(IDR|Rp|USD|EUR|SGD)\s+(.+)$/i.exec(raw.trim());
  if (structured) return formatFinancial({ value: structured[1], currency: structured[2], unit: structured[3] });
  const match = /^([+-]?[\d.,]+)\s*([\s\S]*)$/.exec(raw.trim());
  if (!match) return raw;
  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return raw;
  const absolute = Math.abs(numeric);
  const scale =
    absolute >= 1e18
      ? 1e18
      : absolute >= 1e15
        ? 1e15
        : absolute >= 1e12
          ? 1e12
          : absolute >= 1e9
            ? 1e9
            : absolute >= 1e6
              ? 1e6
              : 0;
  if (!scale) return raw.trim();
  const name =
    scale === 1e18
      ? "quintillion"
      : scale === 1e15
        ? "quadrillion"
        : scale === 1e12
          ? "trillion"
          : scale === 1e9
            ? "billion"
            : "million";
  const short = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(numeric / scale);
  // Retain units and unknown-unit wording so compact figures remain honest.
  const rest = humanizeFigureMeta(match[2]);
  return `≈${short} ${name}${rest ? ` ${rest}` : ""}`;
}

/** Raw provider metadata tokens are not user language — translate them. */
export type FinancialAmount = { value: string | null; currency: string | null; unit: string };

/** Only explicit source scales are supported; magnitude never establishes a scale. */
export function financialScale(unit: string): number | null {
  const key = unit.trim().toLowerCase().replace(/^(idr|rp|rupiah)\s*/, "").replace(/[_-]/g, " ").trim();
  const scales: Record<string, number> = { "": 1, units: 1, unit: 1, absolute: 1, rupiah: 1,
    thousands: 1e3, thousand: 1e3, "in thousands": 1e3, ribu: 1e3,
    millions: 1e6, million: 1e6, "in millions": 1e6, juta: 1e6,
    billions: 1e9, billion: 1e9, "in billions": 1e9, miliar: 1e9,
    trillions: 1e12, trillion: 1e12, "in trillions": 1e12, triliun: 1e12 };
  return unit.trim() ? scales[key] ?? null : null;
}

/** Only authenticated saved financial reports may use relative evidence links. */
export function evidenceHref(value: string): string | null {
  if (/^\/financial-sources\/[0-9a-f-]{36}$/i.test(value)) return value;
  const href = sourceHref(value);
  if (!href) return null;
  const url = new URL(href);
  if (url.hostname === "api.sectors.app" || /^\/v[12]\//.test(url.pathname)) return null;
  url.search = "";
  url.hash = "";
  return url.href;
}

export function evidenceLabel(value: string): string {
  return value.startsWith("/financial-sources/") ? "Saved company report" : new URL(value).hostname;
}

export function toIDR(amount: FinancialAmount): number | null {
  if (!amount.currency || !/^(IDR|Rp|rupiah)$/i.test(amount.currency.trim()) || amount.value === null) return null;
  const scale = financialScale(amount.unit);
  const raw = amount.value.trim().replace(/,/g, "");
  if (scale === null || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) return null;
  const value = Number(raw) * scale;
  return Number.isFinite(value) ? value : null;
}

export function formatIDR(rupiah: number): string {
  return `IDR ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rupiah / 1e12)}T`;
}

/** Shared by cards, source tables, charts and research answers. No exchange rate is assumed. */
export function formatFinancial(amount: FinancialAmount): string {
  if (amount.value === null) return "Conflicting source values";
  const idr = toIDR(amount);
  if (idr !== null) return formatIDR(idr);
  const numeric = Number(amount.value.replace(/,/g, "").replace(/%$/, ""));
  if (amount.unit === "percent") return Number.isFinite(numeric) ? `${amount.value.startsWith("+") && numeric >= 0 ? "+" : ""}${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : amount.value;
  if (["ratio", "count", "shares", "times"].includes(amount.unit)) return `${amount.value} ${amount.unit}`;
  return `${amount.value} ${amount.currency ?? "currency unspecified"} · ${humanizeFigureMeta(amount.unit) || "scale unspecified"}`;
}

export function humanizeFigureMeta(text: string): string {
  return text
    .replaceAll("provider_native_unspecified", "units as reported")
    .replaceAll("reporting_scope_unverified", "reporting scope unverified")
    .replace(/\s+/g, " ")
    .trim();
}

/** Suffix for a structured figure: known currency/unit only, else nothing.
 * Unknown metadata stays in tooltips and caveats, never in the number. */
export function figureUnitSuffix(currency: string | null, unit: string): string {
  const parts = [
    currency,
    unit === "provider_native_unspecified" ? null : unit,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? ` ${parts.join(" · ")}` : "";
}

/**
 * The deterministic fallback wording the backend emits when the model is
 * unavailable or its wording fails validation. The UI hides these exact
 * sentences (the evidence stays) instead of presenting filler as insight.
 */
const CANNED_HYPOTHESES = new Set([
  "This observation may affect competitive positioning; intent is unverified.",
  "Hypothesis: review this evidence when assessing messaging; it does not establish business impact.",
]);

export function isCannedHypothesis(text: string): boolean {
  return CANNED_HYPOTHESES.has(text.trim());
}

/** Statement metrics the comparison pivot understands, in display order. */
export const BRIEF_KINDS = [
  "revenue",
  "revenue_yoy_percent",
  "earnings",
  "earnings_yoy_percent",
  "net_profit_margin",
] as const;

/** "revenue_yoy_percent" -> "revenue YoY %"; everything else passes through. */
export function prettyBriefKind(kind: string): string {
  return kind === "net_profit_margin" ? "Annual net margin · Sectors reported" : kind.replace(/_yoy_percent$/, " YoY %");
}
