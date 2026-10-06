"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { dashboardTime } from "@/lib/format";

/**
 * The dark banner answers the only question the user opens the app with:
 * what arrived since I last looked?
 *
 * Every stat here is competitive insight. API credit usage lives in the
 * sidebar and on /sectors — it is a system metric, and putting it beside
 * "companies tracked" invited the reader to compare unrelated things.
 */
export function SummaryBanner() {
  const { newSinceLastCheck, aggregates, signals, range, loading } = useStore();

  if (loading || !aggregates) {
    return (
      <div className="rounded-card bg-ink-strong p-5 md:px-[22px]">
        <Skeleton className="h-6 w-64 opacity-30" />
        <Skeleton className="mt-2 h-4 w-80 opacity-20" />
      </div>
    );
  }

  const unseen = signals.filter((s) => !s.seen);
  // The most severe unseen signal is what the call to action should open.
  const priority =
    unseen.find((s) => s.severity === "high") ??
    unseen.find((s) => s.severity === "medium") ??
    unseen[0];

  const headline =
    newSinceLastCheck === 0
      ? "No unread findings"
      : `${newSinceLastCheck} finding${newSinceLastCheck === 1 ? "" : "s"} to review`;

  const subline =
    newSinceLastCheck === 0
      ? signals.length ? `Last research: ${dashboardTime(aggregates.lastRunAt)}. Check the investigation for source coverage.` : "Start an investigation to assess competitor activity and source coverage."
      : priority?.severity === "high"
        ? `One is high severity and involves ${priority.company}.`
        : "None are high severity. Review when convenient.";

  const rangeLabel = range === "week" ? "this week" : "this month";

  const stats = [
    { label: "Companies tracked", value: String(aggregates.companiesTracked) },
    {
      label: `Signals ${rangeLabel}`,
      value: String(aggregates.signalsInRange),
    },
    { label: "High severity", value: String(aggregates.highSeverityCount) },
  ];

  return (
    <div className="flex flex-wrap justify-between gap-[22px] rounded-card bg-ink-strong p-5 text-surface md:px-[22px]">
      <div className="flex-1 basis-50">
        <p className="text-[19px] font-bold tracking-[-0.02em]">{headline}</p>
        <p className="mt-1 text-sm text-muted-on-dark">{subline}</p>

        {/* The most important sentence on the page needs somewhere to go. */}
        {priority ? (
          <Link
            href={`/signals/${priority.id}`}
            className="mt-3.5 inline-flex items-center gap-1.5 rounded-[9px] bg-surface px-3.5 py-2 text-[13px] font-bold text-ink-strong no-underline transition-console hover:bg-white active:scale-[0.98]"
          >
            Review signal
            <ArrowRight aria-hidden size={14} strokeWidth={2} />
          </Link>
        ) : null}
      </div>

      <dl className="flex flex-wrap gap-x-[26px] gap-y-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted-on-dark">{stat.label}</dt>
            <dd className="text-[26px] font-extrabold tracking-[-0.03em]">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
