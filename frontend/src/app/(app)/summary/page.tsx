"use client";

import Link from "next/link";
import { ArrowRight, FileCheck2, RefreshCw, Sparkles } from "lucide-react";
import { Card, CardHeader, Disclaimer, PageTitle, Pill, SeverityPill } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { dashboardTime } from "@/lib/format";

const WEIGHT = { high: 3, medium: 2, low: 1 } as const;

export default function SummaryPage() {
  const { aggregates, signals, watchlist } = useStore();
  const ranked = [...signals].sort((a, b) => WEIGHT[b.severity] - WEIGHT[a.severity]);
  const priority = ranked[0];
  const companiesWithChanges = new Set(signals.map((signal) => signal.company)).size;
  const evidenceCount = signals.reduce((total, signal) => total + signal.evidence.length, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Summary report</PageTitle>
          <p className="mt-0.5 max-w-[70ch] text-sm text-muted">
            The latest agent brief for “{watchlist?.name ?? "your watchlist"},” assembled from stored competitor changes and cited financial context.
          </p>
        </div>
        <Pill tone="quiet">
          Updated {aggregates ? dashboardTime(aggregates.lastRunAt) : "after the next run"}
        </Pill>
      </div>

      <section className="rounded-card bg-ink-strong p-5 text-surface md:p-[22px]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-[72ch]">
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.11em] text-accent">
              <Sparkles aria-hidden size={14} /> Agent executive brief
            </p>
            <h2 className="mt-2 text-[22px] font-extrabold tracking-[-0.025em]">
              {priority
                ? `${priority.company} carries the highest-priority recent change`
                : "No competitor change currently crosses the reporting threshold"}
            </h2>
            <p className="mt-2 text-sm leading-[1.65] text-muted-on-dark">
              {aggregates?.interpretation.body ??
                "Run an investigation to produce an evidence-grounded summary. RivalPulse updates this report after each completed research run."}
            </p>
          </div>
          <Link href="/runs" className="inline-flex items-center gap-2 rounded-field bg-surface px-3.5 py-2 text-[13px] font-bold text-ink no-underline transition-console hover:bg-white active:scale-[0.98]">
            <RefreshCw aria-hidden size={14} /> Refresh intelligence
          </Link>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4">
          {[
            ["Competitors covered", watchlist?.companies.length ?? 0],
            ["With detected changes", companiesWithChanges],
            ["Published signals", signals.length],
            ["Evidence items", evidenceCount],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-on-dark">{label}</dt>
              <dd className="mt-0.5 text-2xl font-extrabold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="min-w-0">
          <CardHeader title="Important competitor changes" aside={<span className="text-[13px] text-muted">Ranked by positioning impact</span>} />
          <div className="flex flex-col">
            {ranked.slice(0, 5).map((signal, index) => (
              <Link
                key={signal.id}
                href={`/signals/${signal.id}`}
                className="group grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 border-b border-divider py-3.5 no-underline last:border-0"
              >
                <span className="pt-0.5 text-xs font-extrabold text-muted">0{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-[1.4] text-ink transition-console group-hover:text-accent-ink">{signal.title}</span>
                  <span className="mt-1 block text-[13px] text-muted">{signal.company} · {signal.type} · detected {signal.detectedAt}</span>
                </span>
                <SeverityPill severity={signal.severity} />
              </Link>
            ))}
            {!ranked.length ? <p className="py-6 text-sm text-muted">No reportable changes yet.</p> : null}
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Report integrity" />
          <div className="rounded-detail border border-divider bg-subtle p-3.5">
            <div className="flex items-center gap-2 text-sm font-bold"><FileCheck2 aria-hidden size={16} className="text-accent" /> Evidence discipline</div>
            <p className="mt-2 text-[13px] leading-[1.55] text-muted">
              Financial facts come from Sectors snapshots. Public changes are stored as observations. Strategic intent remains explicitly labeled as an AI hypothesis.
            </p>
          </div>
          <dl className="mt-4 flex flex-col gap-3 text-[13px]">
            <div className="flex justify-between gap-4"><dt className="text-muted">Facts</dt><dd className="font-bold">{aggregates?.interpretation.counts.facts ?? 0}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Observed signals</dt><dd className="font-bold">{aggregates?.interpretation.counts.observedSignals ?? 0}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">AI hypotheses</dt><dd className="font-bold text-accent-ink">{aggregates?.interpretation.counts.hypotheses ?? 0}</dd></div>
          </dl>
          {priority ? (
            <Link href={`/signals/${priority.id}`} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline hover:text-accent">
              Open highest-priority evidence <ArrowRight aria-hidden size={14} />
            </Link>
          ) : null}
        </Card>
      </div>

      <Disclaimer />
    </>
  );
}
