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

/**
 * The one place a range is turned into words.
 *
 * Every card used to carry its own time label ("Last 30 days", "This month"),
 * which made the dashboard look like it was reporting on several different
 * periods at once. They all read from this now, so the header toggle and the
 * cards can never disagree.
 */
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
      return "The local AI model was unavailable. Start Ollama with qwen3.8:27b installed, then retry.";
    case "LLM_NOT_CONFIGURED":
      return "No AI model is configured (OLLAMA_MODEL is empty). Set it in backend/.env, then retry.";
    case "LLM_BUDGET_EXCEEDED":
      return "The run used up its AI call budget before finishing. Retry with a narrower question.";
    case "PROVIDER_CREDENTIALS_MISSING":
      return "No Sectors API key is configured. Set SECTORS_API_KEY in backend/.env, restart the stack, then retry.";
    case "PROVIDER_AUTH_FAILED":
      return "Sectors rejected the API key. Check SECTORS_API_KEY in backend/.env, then retry.";
    case "PROVIDER_UNAVAILABLE":
    case "PROVIDER_REQUEST_REJECTED":
      return "Sectors could not serve the request. Wait a moment, then retry — collected evidence is kept.";
    case "PROVIDER_INVALID_RESPONSE":
      return "Sectors returned data in an unexpected shape. Retry; if it persists, the provider contract may have changed.";
    case "RESPONSE_TOO_LARGE":
      return "A provider response exceeded the size limit. Retry with a narrower question.";
    case "CREDIT_BUDGET_EXCEEDED":
    case "TOOL_BUDGET_EXCEEDED":
      return "The run hit its Sectors credit or request budget. Cached evidence is kept — retry a smaller question.";
    case "CACHE_UNAVAILABLE":
      return "The backend cache was unreachable. Check Redis, then retry.";
    case "UNSUPPORTED_MODE":
      return "This run used a retired provider mode. Start a new investigation instead of retrying.";
    case "RUN_INTERRUPTED":
      return "The run lost its execution lease (likely superseded). Start a new investigation.";
    case "WORKER_INTERRUPTED":
      return "The worker was interrupted before finishing (restart or timeout fence). Collected evidence is kept — retry the investigation.";
    case "CANCELLED":
    case "cancelled by user":
      return "This investigation was stopped. No new findings were published.";
    case "RUN_TIMEOUT":
      return "The investigation exceeded its time limit. Retry a narrower question.";
    case "run stream":
      return "The live connection dropped before the run finished. Reopen the chat to resume watching it — the backend run itself keeps going.";
    case "INTERNAL_ERROR":
      return "The backend hit an unexpected error. Check the API logs for the run id, then retry.";
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
  // A suffix of pure unknown-unit noise ("units as reported") is dropped:
  // the number stands alone, tooltips and caveats keep the full story.
  const rest = humanizeFigureMeta(match[2]);
  const noise = rest === "" || rest.split(/\s+/).every((word) => UNKNOWN_UNIT_WORDS.has(word.toLowerCase()));
  return `≈${short} ${name}${!noise && rest ? ` ${rest}` : ""}`;
}

const UNKNOWN_UNIT_WORDS = new Set([
  "units", "as", "reported", "reporting", "scope", "unverified",
]);

/** Raw provider metadata tokens are not user language — translate them. */
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
] as const;

/** "revenue_yoy_percent" -> "revenue YoY %"; everything else passes through. */
export function prettyBriefKind(kind: string): string {
  return kind.replace(/_yoy_percent$/, " YoY %");
}
