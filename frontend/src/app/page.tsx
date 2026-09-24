"use client";

import {
  Disclaimer,
  ErrorCard,
  PageTitle,
  Skeleton,
  cx,
} from "@/components/ui/primitives";
import { SummaryBanner } from "@/components/dashboard/SummaryBanner";
import { SignalPipeline } from "@/components/dashboard/SignalPipeline";
import { SignalMix } from "@/components/dashboard/SignalMix";
import { LatestSignals } from "@/components/dashboard/LatestSignals";
import { AgentRunCard } from "@/components/dashboard/AgentRunCard";
import { AiInterpretation } from "@/components/dashboard/AiInterpretation";
import { useStore } from "@/lib/store";
import type { Range } from "@/lib/types";

export default function DashboardPage() {
  const { watchlist, aggregates, range, setRange, loading, error, reload } =
    useStore();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Competitive overview</PageTitle>
          {loading || !watchlist || !aggregates ? (
            <Skeleton className="mt-1.5 h-4 w-72" />
          ) : (
            <p className="mt-0.5 text-sm text-muted">
              Watchlist “{watchlist.name}” · last agent run{" "}
              {aggregates.lastRunAt}
            </p>
          )}
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </div>

      {error ? <ErrorCard message={error} onRetry={reload} /> : null}

      <SummaryBanner />

      {/* Keyed on range so both charts replay their growth on a range switch. */}
      <div className="flex flex-wrap items-stretch gap-4">
        <SignalPipeline key={`pipeline-${range}`} />
        <SignalMix key={`mix-${range}`} />
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <LatestSignals />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <AgentRunCard />
          <AiInterpretation />
        </div>
      </div>

      <Disclaimer />
    </>
  );
}

function RangeToggle({
  value,
  onChange,
}: {
  value: Range;
  onChange: (next: Range) => void;
}) {
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
              "cursor-pointer rounded-[9px] px-3.5 py-[7px] transition-console",
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
  );
}
