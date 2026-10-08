import Link from "next/link";
import type { Signal } from "@/lib/types";

/** Backend facts and conditional reasoning stay visibly separate. No model calls on render. */
export function DecisionSupport({ signal, compact = false }: { signal: Signal; compact?: boolean }) {
  const data = signal.decisionSupport;
  const unavailable = !data || data.status === "unavailable";
  const observed = data?.what_happened ?? signal.evidence.find((item) => item.kind === "observed_signal")?.text ?? signal.headline;
  const nextSteps: Partial<Record<Signal["type"], string>> = {
    "Financial update": "Verify the guidance's period, funding assumptions and planned versus realised expenditure against management's disclosure.",
    "Analyst commentary": "Confirm which companies the analyst discusses, and verify any claimed company action against an attributable company announcement.",
    "Market context": "Find a dated, attributable company announcement before treating this background coverage as a competitor move.",
  };
  const fields = [
    ["What happened", observed],
    ["Why it matters to our company", data?.why_it_matters ?? (signal.classificationRevised ? (signal.classificationNote ?? "The original interpretation is withheld after an attribution correction.") : "A structured relevance assessment was not saved for this older finding. The original evidence remains available.")],
    ["Potential implication · inference", data?.potential_implication ?? "Not enough evidence yet to say how this affects your company. Use the next step below to confirm it."],
    ["Recommended next step", data?.recommended_next_step ?? nextSteps[signal.type] ?? "Check the original announcement's scope and confirm customer or product overlap with your company before deciding on a response."],
  ];
  return <section aria-label={`Decision support for ${signal.company}`} className="min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="text-base font-bold">Why this matters</h2>
      <span className="text-xs font-semibold text-muted" role="status">{!data ? signal.classificationRevised ? "Classification corrected · interpretation withheld" : "Older finding · structured analysis not saved" : unavailable ? "Verification steps · no AI explanation yet" : data.status === "limited" ? "Limited relevance · conditional analysis" : "Evidence-linked analysis"}</span>
    </div>
    {data ? <p className="mt-2 text-xs leading-relaxed text-muted">{data.perspective ? `Investigation perspective: ${data.perspective}` : "Neutral investigation · no own-company perspective"} · {data.origin === "ai" ? `AI inference · ${data.uncertainty} uncertainty` : "Rule-based verification steps · not an AI impact assessment"}</p> : null}
    <dl className="mt-3 divide-y divide-divider">
      {fields.map(([label, text], index) => <div key={label} className="py-3">
        <dt className="text-xs font-bold text-ink-2">{label}</dt>
        <dd className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-ink">{compact && index === 0 && text.length > 350 ? `${text.slice(0, 350)}…` : text}</dd>
      </div>)}
      <div className="py-3"><dt className="text-xs font-bold text-ink-2">What remains unknown</dt>
        <dd className="mt-1.5"><ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted">{(data?.limitations ?? ["The original unstructured interpretation has not been revalidated for this view. No new AI analysis was performed."]).map((note, index) => <li key={index}>{note}</li>)}</ul></dd>
      </div>
    </dl>
    {!data && !signal.classificationRevised && signal.financialContext.whyItMatters ? <details className="mt-2 border-t border-divider pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-muted">Original unstructured wording · not revalidated</summary>
      <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-muted">{signal.financialContext.whyItMatters}</p>
    </details> : null}
    {compact ? <Link href={`/signals/${signal.id}`} className="inline-flex min-h-10 items-center text-xs font-bold text-accent-ink">Open finding and supporting evidence →</Link> : null}
  </section>;
}
