"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { RANGE_LABEL } from "@/lib/format";
import type { PipelineStage } from "@/lib/types";

const TONE: Record<PipelineStage["tone"], string> = {
  accent: "bg-accent",
  ink: "bg-ink-strong",
  neutral: "bg-neutral-300",
};

/**
 * The funnel from collected change to delivered alert. This card is the
 * product's answer to "monitoring tools are noisy": the drop-off is the point.
 */
export function SignalPipeline() {
  const { aggregates, range, loading } = useStore();
  const [mounted, setMounted] = useState(false);

  // Bars grow from zero on first paint. The dashboard keys this card on the
  // range, so switching range remounts it and replays the growth.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const stages = aggregates?.pipeline ?? [];
  const delivered = stages[stages.length - 1];

  return (
    <Card className="min-w-0 flex-[1.4_1_380px]">
      <CardHeader
        title="Signal pipeline"
        aside={
          <span className="text-[13px] text-muted">
            {RANGE_LABEL[range]}
          </span>
        }
        className="mb-[18px] flex items-center justify-between gap-3"
      />

      {loading || !delivered ? (
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[22px] w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          {stages.map((stage) => (
            <div key={stage.label} className="flex items-center gap-3.5">
              <span className="w-[108px] shrink-0 text-[13px] text-ink-2">
                {stage.label}
              </span>
              <div
                role="img"
                aria-label={`${stage.label}: ${stage.count} (${stage.percent}%)`}
                className="h-[22px] flex-1 overflow-hidden rounded-bar bg-subtle"
              >
                <div
                  className={`h-full rounded-bar transition-chart ${TONE[stage.tone]}`}
                  style={{ width: mounted ? `${stage.percent}%` : "0%" }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-sm font-bold">
                {stage.count}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-[18px] border-t border-divider pt-4 text-[13px] text-muted">
        Filtering keeps the feed quiet: only {delivered?.percent ?? 0}% of
        collected changes reach you.
      </p>
    </Card>
  );
}
