"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { RANGE_LABEL } from "@/lib/format";
import type { MixSlice } from "@/lib/types";

/** Cumulative percentages -> conic-gradient stops. */
function gradientFor(mix: MixSlice[]): string {
  let cursor = 0;
  return mix
    .map((slice) => {
      const start = cursor;
      cursor += slice.percent;
      return `${slice.color} ${start}% ${cursor}%`;
    })
    .join(", ");
}

/** What kind of competitive change the feed is actually made of. */
export function SignalMix() {
  const { aggregates, range, loading } = useStore();
  const [mounted, setMounted] = useState(false);

  // Keyed on range by the dashboard, so a range switch replays this.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Card className="min-w-0 flex-[1_1_300px]">
      <CardHeader
        title="Signal mix"
        aside={
          <span className="text-[13px] text-muted">
            {RANGE_LABEL[range]}
          </span>
        }
      />

      {loading || !aggregates ? (
        <div className="flex items-center gap-5">
          <Skeleton className="h-33 w-33 rounded-full" />
          <div className="flex flex-1 flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-32" />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <div
            role="img"
            aria-label={aggregates.mix
              .map((s) => `${s.label} ${s.percent}%`)
              .join(", ")}
            className="flex h-33 w-33 items-center justify-center rounded-full transition-chart"
            style={{
              background: `conic-gradient(${gradientFor(aggregates.mix)})`,
              opacity: mounted ? 1 : 0,
              transform: mounted ? "scale(1)" : "scale(0.94)",
            }}
          >
            <div className="flex h-21 w-21 flex-col items-center justify-center rounded-full bg-card">
              <span className="text-[22px] font-extrabold tracking-[-0.03em]">
                {aggregates.mixTotal}
              </span>
              <span className="text-[11px] text-muted">signals</span>
            </div>
          </div>

          {/* Absolute counts alongside the share: a percentage of a small
              number is easy to over-read. */}
          <ul className="flex min-w-[150px] flex-1 flex-col gap-2.5 text-[13px]">
            {aggregates.mix.map((slice) => (
              <li
                key={slice.label}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-[9px] w-[9px] shrink-0 rounded-[3px] ring-1 ring-border"
                    style={{ background: slice.color }}
                  />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-bold">{slice.count}</span>
                  <span className="ml-1.5 text-muted">{slice.percent}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
