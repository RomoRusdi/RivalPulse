import type { Signal, Watchlist } from "./types";

export function promptSuggestions(watchlist: Watchlist | null, signals: Signal[]) {
  const companies = watchlist?.companies ?? [];
  if (!companies.length) return [{ title: "Build your watchlist", query: "Help me choose companies to add to my watchlist." }];
  const symbols = companies.map((company) => company.ticker);
  const recent = [...signals].filter((signal) => symbols.includes(signal.company))
    .sort((a, b) => (b.addedAt ?? b.detectedAt).localeCompare(a.addedAt ?? a.detectedAt))[0];
  return [
    recent ? { title: `Review ${recent.company} ${recent.type.toLowerCase()}${recent.findingScope && recent.findingScope !== "competitor_move" ? "" : " activity"}`, query: `Review this stored ${recent.company} finding: “${recent.headline}”. Explain what was observed and cite the evidence.` }
      : { title: `Research ${symbols[0]} activity`, query: `Research recent product, pricing, and partnership activity for ${symbols[0]}. Cite the evidence and explain coverage limitations.` },
    { title: symbols.length > 1 ? "Compare financial performance" : `${symbols[0]} financial performance`, query: `Compare reported revenue and earnings for ${symbols.join(" and ")} over the available annual periods. Use verified source units and cite the reports.` },
    { title: "Summarize watched companies", query: `Summarize the stored findings for ${symbols.join(", ")}. Separate observed events from hypotheses and identify missing evidence.` },
  ];
}
