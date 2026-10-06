import { toIDR } from "./format";

export interface RevenueDatum {
  period: string; value: string | null; currency: string | null; unit: string; basis: string;
  sourceUrl: string; snapshotId?: string | null; limitation?: string | null;
}
export interface RevenueSeries { company: string; points: RevenueDatum[]; note?: string }
export function revenueSeries(series: RevenueSeries) {
  const groups = new Map<number, RevenueDatum[]>();
  for (const point of series.points) {
    if (!/^(?:FY)?(?:19|20)\d{2}$/.test(point.period)) continue;
    const year = Number(point.period.replace("FY", ""));
    groups.set(year, [...(groups.get(year) ?? []), point]);
  }
  const points = [...groups].sort(([a], [b]) => a - b).map(([year, entries]) => {
    const point = entries[0];
    const conflict = entries.some((entry) => entry.value !== point.value || entry.currency !== point.currency || entry.unit !== point.unit || entry.basis !== point.basis);
    const knownBasis = point.basis.trim() && !/unknown|unverified|unspecified/i.test(point.basis);
    const value = conflict || !knownBasis ? null : toIDR(point);
    return { ...point, year, rupiah: value !== null && value >= 0 ? value : null, change: null as number | null };
  });
  for (let i = 1; i < points.length; i++) {
    const current = points[i], previous = points[i - 1];
    const boundary = /merger|scope change|acquisition/i.test(series.note ?? "") &&
      [...(series.note ?? "").matchAll(/\b(20\d{2})\b/g)].some((match) => previous.year < Number(match[1]) && Number(match[1]) <= current.year) && !/restated/i.test(current.basis);
    if (current.rupiah !== null && previous.rupiah !== null && previous.rupiah > 0 && current.year === previous.year + 1 &&
      current.basis === previous.basis && !boundary && !current.limitation && !previous.limitation) {
      const change = (current.rupiah / previous.rupiah - 1) * 100;
      current.change = Number.isFinite(change) ? change : null;
    }
  }
  return { ...series, points, excluded: series.points.length - points.filter((point) => point.rupiah !== null).length };
}
