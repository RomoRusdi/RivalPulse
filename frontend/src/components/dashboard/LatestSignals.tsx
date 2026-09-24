"use client";

import Link from "next/link";
import {
  Card,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { SignalRow } from "./SignalRow";

export function LatestSignals() {
  const { signals, loading, watchlist } = useStore();
  const rows = signals.slice(0, 4);

  return (
    <Card className="min-w-0 flex-[1.4_1_380px]">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <CardTitle>Latest signals</CardTitle>
        <Link
          href="/signals"
          className="text-[13px] font-semibold text-accent-ink no-underline transition-console hover:text-accent"
        >
          View all
        </Link>
      </div>
      <p className="mb-3.5 text-[13px] text-muted">
        Severity = impact on your positioning, not stock price.
      </p>

      {loading ? (
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No signals yet"
          body={`Nothing has crossed the threshold for ${watchlist?.name ?? "this watchlist"}. The next scheduled run will compare against the stored state.`}
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
  );
}
