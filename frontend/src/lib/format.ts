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

/** Seconds -> "00:42". */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
