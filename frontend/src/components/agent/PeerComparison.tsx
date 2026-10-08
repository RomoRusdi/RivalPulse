import Link from "next/link";
import type { AgentRun } from "@/lib/types";
import { sectorKey } from "@/lib/sector-groups";

type Comparison = NonNullable<AgentRun["comparison"]>;
type Brief = NonNullable<AgentRun["financialBrief"]>;
const PROFIT_LABEL = {
  profit: "Reported profit",
  loss: "Reported loss",
  swung_to_loss: "Swung to loss",
  break_even: "Break-even",
};

function Ratio({ value, rank, size, note, origin, missingLabel }: {
  value: string | null; rank: number | null; size: number; note: string;
  origin?: "provider_reported" | "calculated" | null; missingLabel: string;
}) {
  return (
    <>
      <span className={value === null ? "text-muted" : "font-bold tabular-nums text-ink"}>
        {value === null ? missingLabel : `${value}%`}
      </span>
      {value !== null && origin ? <span className="mt-1 block text-[10px] font-semibold text-ink-2">{origin === "provider_reported" ? "Sectors reported" : "Calculated"}</span> : null}
      <span className="mt-1 block text-[10px] text-muted">
        {rank !== null && size >= 2 ? `#${rank} of ${size} eligible peers` : "Not ranked"}
      </span>
      {note && value === null ? <p className="ml-auto mt-1 max-w-[24ch] text-[10px] leading-relaxed text-muted">{note}</p> : null}
    </>
  );
}

/** A run-owned answer, not a fresh fetch or a ranking inferred by the browser. */
export function PeerComparison({ comparison, brief }: { comparison: Comparison; brief?: Brief }) {
  const mixed = new Set(comparison.entries.map((entry) => sectorKey(entry.industry))).size > 1;
  const claims = new Map(brief?.rows.flatMap((company) =>
    [...company.metrics, ...company.revenue_history].map((metric) => [metric.claim_id, metric] as const)) ?? []);
  return (
    <section className="mt-4 border-t border-divider pt-4" aria-label="Competitor comparison">
      <h3 className="text-sm font-bold text-ink">
        {mixed ? "Selected companies · mixed-sector context" : comparison.perspective ? `${comparison.perspective} vs. selected competitors` : "Selected competitor comparison"}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {comparison.period ? `Annual statements · ${comparison.period}` : "No shared reporting year"}
        {mixed ? " · No single peer group. Banks and telecoms are not ranked against each other." : ` · ${comparison.sector} peer group.`} Rankings require compatible reporting evidence, not just the same sector.
      </p>
      <div className="mt-3 overflow-x-auto rounded-field border border-divider" tabIndex={0} aria-label="Scroll comparison table horizontally">
        <table className="w-full min-w-[680px] border-collapse text-xs">
          <caption className="sr-only">Annual financial comparison and activity coverage for every company in this investigation</caption>
          <thead>
            <tr className="bg-subtle/70 text-left text-muted">
              <th scope="col" className="px-3 py-2">Company</th>
              <th scope="col" className="px-3 py-2 text-right">Revenue growth</th>
              <th scope="col" className="px-3 py-2 text-right">Net margin</th>
              <th scope="col" className="px-3 py-2">Reported earnings</th>
              <th scope="col" className="px-3 py-2">Activity evidence</th>
            </tr>
          </thead>
          <tbody>
            {comparison.entries.map((entry) => {
              const ours = comparison.perspective === entry.symbol;
              const snapshots = [...new Set(entry.claim_ids.map((claim) => claims.get(claim)?.snapshot_id).filter((id): id is string => Boolean(id)))];
              return (
                <tr key={entry.symbol} className={`border-t border-divider ${ours ? "bg-accent-wash/40" : ""}`}>
                  <th scope="row" className="px-3 py-3 text-left align-top">
                    <span className="font-extrabold text-ink">{entry.symbol}</span>
                    {ours ? <span className="mt-1 block text-[10px] font-bold text-accent-ink">Your company</span> : null}
                    <span className="mt-1 block max-w-32 text-[10px] font-normal text-muted">{entry.industry}{!entry.peer_group ? " · other sector" : ""}</span>
                    {snapshots.map((snapshotId) => (
                      <Link key={snapshotId} href={`/financial-sources/${snapshotId}`} className="mt-2 block whitespace-nowrap font-semibold text-accent-ink underline underline-offset-2" aria-label={`View saved financial evidence for ${entry.symbol}`}>
                        Evidence ↗
                      </Link>
                    ))}
                  </th>
                  <td className="px-3 py-3 text-right align-top"><Ratio value={entry.revenue_growth_percent} rank={entry.growth_rank} size={entry.growth_rank_size} note={entry.growth_note} missingLabel="Not calculated" /></td>
                  <td className="px-3 py-3 text-right align-top"><Ratio value={entry.net_margin_percent} rank={entry.margin_rank} size={entry.margin_rank_size} note={entry.margin_note} origin={entry.net_margin_origin} missingLabel="No verified figure" /></td>
                  <td className="px-3 py-3 align-top text-ink-2">{entry.profit ? PROFIT_LABEL[entry.profit] : "Unavailable"}</td>
                  <td className="max-w-48 px-3 py-3 align-top text-ink-2">
                    <span>{entry.findings} stored {entry.findings === 1 ? "finding" : "findings"}</span>
                    {entry.activity_note ? <p className="mt-1 text-[10px] leading-relaxed text-muted">{entry.activity_note}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="mt-3 text-xs leading-relaxed text-muted">
        <summary className="cursor-pointer font-semibold text-ink-2">How to read this comparison · limitations</summary>
        <ul className="mt-2 flex flex-col gap-2 pl-4">
          {comparison.notes.map((note) => <li key={note} className="list-disc">{note}</li>)}
          {comparison.entries.filter((entry) => entry.notes.length > 0).map((entry) => (
            <li key={entry.symbol} className="list-disc"><strong>{entry.symbol}:</strong> {entry.notes.join(" ")}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
