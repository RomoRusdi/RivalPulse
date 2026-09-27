"use client";

import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, CircleDollarSign } from "lucide-react";
import { Card, Disclaimer, PageTitle, Pill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { longDate } from "@/lib/format";

export default function TimelinePage() {
  const { signals, watchlist } = useStore();
  const ordered = [...signals].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Competitor signal timeline</PageTitle>
          <p className="mt-0.5 max-w-[70ch] text-sm text-muted">
            A chronological record of product, pricing, partnership, campaign, and financial changes. New completed runs appear here automatically.
          </p>
        </div>
        <Pill tone="quiet">{watchlist?.companies.length ?? 0} competitors monitored</Pill>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">Coverage</p>
          <dl className="mt-3 flex flex-col gap-3">
            {(watchlist?.companies ?? []).map((company) => {
              const count = signals.filter((signal) => signal.company === company.ticker).length;
              return (
                <div key={company.ticker} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="font-bold">{company.ticker}</dt>
                  <dd className="text-muted">{count} event{count === 1 ? "" : "s"}</dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-4 border-t border-divider pt-3 text-[11px] leading-[1.5] text-muted">
            Detection time and publication time remain separate in the evidence ledger.
          </p>
        </Card>

        <Card className="min-w-0">
          {ordered.length ? (
            <ol className="relative ml-2 border-l-2 border-divider pl-6">
              {ordered.map((signal, index) => {
                const revenueChange = signal.financialContext.metrics.find((metric) => metric.label.toLowerCase().includes("growth"));
                return (
                  <li key={signal.id} className={cx("relative pb-7", index === ordered.length - 1 && "pb-0")}>
                    <span aria-hidden className={cx("absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card ring-2 ring-divider", signal.severity === "high" ? "bg-accent" : "bg-ink-strong")} />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-xs font-bold text-muted"><CalendarDays aria-hidden size={13} />{longDate(signal.detectedAt)}</p>
                        <h2 className="mt-1.5 text-[17px] font-bold leading-[1.4]">{signal.title}</h2>
                        <p className="mt-1 text-[13px] text-muted">{signal.company} · {signal.companyName}</p>
                      </div>
                      <div className="flex items-center gap-2"><Pill>{signal.type}</Pill>{!signal.seen ? <Pill tone="accent">New</Pill> : null}</div>
                    </div>
                    <p className="mt-3 max-w-[76ch] text-sm leading-[1.6] text-ink-2">{signal.headline}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs font-semibold text-ink-2"><Activity aria-hidden size={12} />{signal.evidence.length} evidence item{signal.evidence.length === 1 ? "" : "s"}</span>
                      {revenueChange ? <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-1 text-xs font-semibold text-accent-ink"><CircleDollarSign aria-hidden size={12} />{revenueChange.label}: {revenueChange.value}</span> : null}
                    </div>
                    <Link href={`/signals/${signal.id}`} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline transition-console hover:text-accent">Review event evidence <ArrowRight aria-hidden size={14} /></Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="py-8 text-center text-sm text-muted">No timeline events yet. Complete an agent run to establish the first baseline.</p>
          )}
        </Card>
      </div>

      <Disclaimer />
    </>
  );
}
