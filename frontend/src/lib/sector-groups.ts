/** Catalogue-sector grouping is presentation context, never proof of comparability. */
export function sectorKey(label: string | undefined | null): string {
  const text = (label ?? "").trim().toLowerCase();
  return text.endsWith("s") ? text.slice(0, -1) : text;
}

export function sectorGroups<T>(items: T[], industry: (item: T) => string | undefined | null, symbol: (item: T) => string) {
  const groups = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const label = industry(item)?.trim();
    const key = sectorKey(label) || `unknown:${symbol(item)}`;
    const group = groups.get(key) ?? { label: label || `Sector unverified · ${symbol(item)}`, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
