"use client";

import { useState } from "react";
import {
  Card,
  Disclaimer,
  EmptyState,
  PageTitle,
  cx,
} from "@/components/ui/primitives";
import { SignalRow } from "@/components/dashboard/SignalRow";
import { useStore } from "@/lib/store";
import type { Severity } from "@/lib/types";

type Filter = "all" | Severity | "unseen";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unseen", label: "New" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

export default function SignalsPage() {
  const { signals, watchlist, markAllSeen, newSinceLastCheck } = useStore();
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
          <PageTitle>Signals</PageTitle>
          <p className="mt-0.5 text-sm text-muted">
            Every change that crossed the threshold for “
            {watchlist?.name ?? "…"}” · {newSinceLastCheck} new
          </p>
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

      <Card className="min-w-0">
        <p className="mb-2 text-[13px] text-muted">
          Severity = impact on your positioning, not stock price.
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title="No signals match this filter"
            body="Nothing here is a problem — a quiet feed means the threshold is holding. Try another filter or run a fresh investigation."
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
      </Card>

      <Disclaimer />
    </>
  );
}
