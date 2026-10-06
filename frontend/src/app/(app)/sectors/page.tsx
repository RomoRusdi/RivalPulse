"use client";

import Link from "next/link";
import { ArrowLeft, Database, Leaf } from "lucide-react";
import { Card, CardHeader, Disclaimer, ErrorCard, PageTitle, Skeleton } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

const SOURCES = [
  { name: "Financial statements", source: "Sectors", purpose: "Annual revenue, earnings, and company context" },
  { name: "Company news", source: "Sectors", purpose: "Company announcements and structured news" },
  { name: "Competitor activity", source: "Approved company pages", purpose: "Product, pricing, campaign, and partnership evidence" },
];

export default function SectorsPage() {
  const { aggregates, loading, error, reload } = useStore();
  const credits = aggregates?.credits;
  const percent = credits?.availablePercent ?? 0;
  return (
    <>
      <Link href="/settings" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline hover:text-accent"><ArrowLeft aria-hidden size={14} /> Back to settings</Link>
      <div><PageTitle>Research data</PageTitle><p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted">Financial context and competitor evidence, with a clear view of the research allowance.</p></div>
      {loading ? <Card aria-label="Loading research usage"><Skeleton className="h-7 w-56" /><Skeleton className="mt-4 h-5 w-full" /></Card> : error || !credits ? <ErrorCard message={error ?? "Research usage is temporarily unavailable."} onRetry={reload} /> : (
        <div className="rounded-card bg-ink-strong p-5 text-surface md:px-[22px]">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-on-dark">Workspace research remaining</p>
          <p className="mt-2 text-[23px] font-extrabold tracking-tight">{percent}% <span className="text-base font-medium text-muted-on-dark">remaining · {credits.available.toLocaleString()} research credits available</span></p>
          <div role="meter" aria-label="Usable research allowance remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-4 h-3 overflow-hidden rounded-bar bg-white/10"><div className="h-full rounded-bar bg-accent transition-chart" style={{ width: `${percent}%` }} /></div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-on-dark">Your workspace allowance is shared by its members. Available credits also respect the research provider’s remaining capacity. These are research credits, rather than AI tokens.</p>
          {credits.providerLimited ? <p className="mt-2 text-xs text-muted-on-dark">Provider capacity currently limits the amount available to this workspace.</p> : null}
          {credits.available === 0 ? <p role="status" className="mt-2 text-sm font-semibold">Research allowance exhausted. Existing evidence remains available.</p> : null}
          <p className="mt-4 inline-flex items-center gap-2 text-sm"><Leaf aria-hidden size={16} className="text-accent" />{Math.round(credits.cacheHitRate * 100)}% of requests reused existing evidence.</p>
        </div>
      )}
      <Card className="min-w-0">
        <CardHeader title="Sources used in research" aside={<Database aria-hidden size={19} className="text-accent" />} />
        <div className="grid gap-3 md:grid-cols-3">{SOURCES.map((source) => <div key={source.name} className="rounded-detail border border-divider p-4"><p className="text-sm font-bold">{source.name}</p><p className="mt-1 text-xs font-semibold text-accent-ink">{source.source}</p><p className="mt-3 text-[13px] leading-relaxed text-muted">{source.purpose}</p></div>)}</div>
        <p className="mt-5 border-t border-divider pt-4 text-[13px] leading-relaxed text-muted">Availability varies by company and source. Research results show missing evidence and source timestamps so you can assess their coverage.</p>
      </Card>
      <Disclaimer />
    </>
  );
}
