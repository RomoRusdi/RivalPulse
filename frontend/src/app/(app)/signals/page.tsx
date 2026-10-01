"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Card,
  Disclaimer,
  EmptyState,
  ErrorCard,
  PageTitle,
  Skeleton,
  cx,
} from "@/components/ui/primitives";
import { SignalRow } from "@/components/dashboard/SignalRow";
import { SummaryBanner } from "@/components/dashboard/SummaryBanner";
import { SignalMix } from "@/components/dashboard/SignalMix";
import { CompetitorMomentum } from "@/components/dashboard/CompetitorMomentum";
import { AiInterpretation } from "@/components/dashboard/AiInterpretation";
import { useStore } from "@/lib/store";
import { dashboardTime } from "@/lib/format";
import type { Range, Severity } from "@/lib/types";

type Filter = "all" | Severity | "unseen";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unseen", label: "New" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

/**
 * The single "what changed" destination.
 *
 * This used to be three pages — an overview of aggregates, a chronological
 * timeline, and this list — all rendering the same small set of findings. One
 * page that answers "what changed, how much does it matter, and what is the
 * evidence" beats three that each answer a third of it.
 */
export default function SignalsPage() {
  const {
    signals, watchlist, aggregates, markAllSeen, newSinceLastCheck,
    range, setRange, loading, error, reload,
  } = useStore();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = signals.filter((s) => {
    if (filter === "all") return true;
    if (filter === "unseen") return !s.seen;
    return s.severity === filter;
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>What changed</PageTitle>
          {loading || !watchlist || !aggregates ? (
            <Skeleton className="mt-1.5 h-4 w-72" />
          ) : (
            <p className="mt-0.5 text-sm text-muted">
              Tracked by the agent for “{watchlist.name}” · last investigation {dashboardTime(aggregates.lastRunAt)}
            </p>
          )}
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </div>

      {error ? <ErrorCard message={error} onRetry={reload} /> : null}

      <SummaryBanner />
      <CompetitorMomentum key={`momentum-${range}`} />

      <div className="flex flex-wrap items-stretch gap-4">
        <SignalMix key={`mix-${range}`} />
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <AiInterpretation />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[13px]">
          {FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.id)}
                className={cx(
                  "cursor-pointer rounded-[9px] px-3.5 py-1.75 transition-console",
                  active
                    ? "bg-ink-strong font-semibold text-surface"
                    : "border border-border bg-subtle text-ink-2 hover:bg-[#EBE8E2]",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {newSinceLastCheck > 0 ? (
          <button
            type="button"
            onClick={markAllSeen}
            className="cursor-pointer text-[13px] font-semibold text-accent-ink transition-console hover:text-accent"
          >
            Mark all as seen
          </button>
        ) : null}
      </div>

      <Card className="min-w-0">
        <p className="mb-2 text-[13px] text-muted">
          Severity = impact on your positioning, not stock price.
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title="No signals match this filter"
            body="Nothing here is a problem — a quiet feed means the threshold is holding. Try another filter or ask the agent to investigate."
          />
        ) : (
          <div className="flex flex-col">
            {rows.map((signal, i) => (
              <SignalRow
                key={signal.id}
                signal={signal}
                last={i === rows.length - 1}
              />
            ))}
          </div>
        )}
        {rows.length > 0 ? (
          <Link
            href="/actions"
            className="mt-4 inline-flex items-center gap-1.5 border-t border-divider pt-4 text-[13px] font-bold text-accent-ink no-underline transition-console hover:text-accent"
          >
            Decide what to do about these <ArrowRight aria-hidden size={13} />
          </Link>
        ) : null}
      </Card>

      <Disclaimer />
    </>
  );
}

function RangeToggle({ value, onChange }: { value: Range; onChange: (next: Range) => void }) {
  const options: { id: Range; label: string }[] = [
    { id: "week", label: "This week" },
    { id: "month", label: "This month" },
  ];

  return (
    <div role="group" aria-label="Date range" className="flex gap-2 text-[13px]">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cx(
              "cursor-pointer rounded-[9px] px-3.5 py-[7px] transition-console active:scale-[0.97]",
              active ? "bg-ink-strong font-semibold text-surface" : "border border-border bg-subtle text-ink-2 hover:bg-[#EBE8E2]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
