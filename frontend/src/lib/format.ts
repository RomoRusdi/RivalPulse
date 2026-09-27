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
      return "The local AI model was unavailable. Check Ollama and retry the investigation.";
    case "CANCELLED":
    case "cancelled by user":
      return "This investigation was stopped. No new findings were published.";
    case "RUN_TIMEOUT":
      return "The investigation exceeded its time limit. Please try again.";
    case "run stream":
      return "The connection to the agent was interrupted. Check the run before retrying.";
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
