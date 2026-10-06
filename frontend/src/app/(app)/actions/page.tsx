"use client";

import Link from "next/link";
import { ArrowRight, FileSearch, Lightbulb, ShieldCheck } from "lucide-react";
import { Card, CardHeader, Disclaimer, ErrorCard, PageTitle, Pill, SeverityPill, Skeleton } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { isCannedHypothesis, shortDate } from "@/lib/format";
import type { SignalType } from "@/lib/types";

const ACTIONS: Record<SignalType, string[]> = {
  Pricing: ["Review price and value claims across active campaign landing pages.", "Prepare a value comparison supported by verifiable competitor evidence.", "Brief sales teams on pricing objections and approved responses."],
  Product: ["Compare the launch with your current feature positioning.", "Gather customer proof for the overlapping use case.", "Test one response campaign before changing the broader brand message."],
  Partnership: ["Assess the audience and distribution opportunities the partnership may create.", "Review your own partner and customer proof points.", "Monitor whether the announcement becomes an active commercial campaign."],
  Campaign: ["Review the competitor’s message, audience, and call to action.", "Test a differentiated creative angle with a clear customer benefit.", "Compare message repetition in the next investigation."],
};

export default function ActionsPage() {
  const { signals, loading, error, reload } = useStore();
  const priority = signals.find((signal) => signal.severity === "high") ?? signals.find((signal) => signal.severity === "medium") ?? signals[0];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><PageTitle>Action suggestions</PageTitle><p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted">Response ideas for your highest-priority finding. Review the evidence and your business context before acting.</p></div><Pill tone="quiet">For your review</Pill></div>
      {loading ? <Card><Skeleton className="h-6 w-52" /><Skeleton className="mt-4 h-32 w-full" /></Card> : error ? <ErrorCard message={error} onRetry={reload} /> : priority ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="min-w-0">
            <CardHeader title="Finding to review" aside={<SeverityPill severity={priority.severity} />} />
            <div className="rounded-detail bg-ink-strong p-4 text-surface">
              <p className="text-xs font-bold text-accent">{priority.company} · {priority.type} · {shortDate(priority.detectedAt)}</p>
              <p className="mt-2 text-[18px] font-bold leading-snug">{priority.title}</p>
              {!isCannedHypothesis(priority.financialContext.whyItMatters) ? <p className="mt-3 text-[13px] leading-relaxed text-muted-on-dark">{priority.financialContext.whyItMatters}</p> : null}
              <Link href={`/signals/${priority.id}`} className="mt-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-bold text-white no-underline hover:text-accent">Review supporting evidence <ArrowRight aria-hidden size={15} /></Link>
            </div>
            <h3 className="mt-5 text-sm font-bold">Suggested response</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">General guidance for {priority.type.toLowerCase()} findings, to adapt to your team’s priorities.</p>
            <ol className="mt-4 flex flex-col gap-3">{ACTIONS[priority.type].map((action, index) => <li key={action} className="flex items-start gap-3 rounded-detail border border-divider p-3.5"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-wash text-xs font-bold text-accent-ink">{index + 1}</span><p className="text-sm leading-relaxed text-ink-2">{action}</p></li>)}</ol>
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Before you act" aside={<ShieldCheck aria-hidden size={20} className="text-accent" />} />
            <div className="flex flex-col gap-5">{[
              ["Verify the announcement", "Read the original source and confirm its date, scope, and current availability."],
              ["Separate evidence from interpretation", "Treat AI hypotheses as questions to investigate. Source coverage may be incomplete."],
              ["Define a measurable test", "Choose an audience, a message, and a success measure that fits your business."],
              ["Review with your team", "Agree on the response and review results before expanding the campaign."],
            ].map(([title, body]) => <div key={title}><p className="text-sm font-bold">{title}</p><p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p></div>)}</div>
            <div className="mt-5 flex items-start gap-3 rounded-detail bg-subtle p-4"><FileSearch aria-hidden size={18} className="mt-0.5 shrink-0 text-accent" /><p className="text-[13px] leading-relaxed text-ink-2">These suggestions do not estimate revenue or guarantee a commercial outcome. Use your own measurements to assess the response.</p></div>
          </Card>
        </div>
      ) : (
        <Card><div className="flex items-start gap-3"><Lightbulb aria-hidden className="shrink-0 text-accent" /><div><p className="text-sm font-bold">Gather evidence first</p><p className="mt-1 text-sm leading-relaxed text-muted">Start an investigation to identify findings you can respond to.</p><Link href="/" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent-ink no-underline hover:text-accent">Start research <ArrowRight aria-hidden size={15} /></Link></div></div></Card>
      )}
      <Disclaimer />
    </>
  );
}

