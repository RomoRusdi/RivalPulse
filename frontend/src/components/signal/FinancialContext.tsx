"use client";

import { useEffect, useState } from "react";
import { Eyebrow, cx } from "@/components/ui/primitives";
import type { FinancialContext as FinancialContextData } from "@/lib/types";

/**
 * The Sectors-backed column. This is what separates RivalPulse from a website
 * diff feed: the change on the left, the business performance that explains it
 * on the right.
 */
export function FinancialContext({ data }: { data: FinancialContextData }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
      <div className="rounded-detail border border-border bg-card p-[18px]">
        <p className="mb-3.5 text-[13px] text-muted">{data.seriesCaption}</p>
        <div
          role="img"
          aria-label={data.series
            .map((p) => `${p.label}: ${p.value}`)
            .join(", ")}
          className="flex h-[118px] items-end gap-3"
        >
          {data.series.map((point, index) => (
            <div
              key={point.label}
              className={cx(
                "flex-1 rounded-bar transition-chart",
                point.highlight ? "bg-accent" : BAR_GREYS[index % 3],
              )}
              style={{ height: mounted ? `${point.value}%` : "0%" }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted">
          {data.series.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {data.metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex-[1_1_120px] rounded-detail border border-border bg-card p-4"
          >
            <p
              className={cx(
                "text-[22px] font-extrabold tracking-[-0.03em]",
                metric.accent ? "text-accent" : "text-ink",
              )}
            >
              {metric.value}
            </p>
            <p className="text-xs text-muted">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-detail border border-accent-wash-border bg-accent-wash p-[18px]">
        <Eyebrow className="text-accent-ink">Why marketing should care</Eyebrow>
        <p className="mt-2 text-[15px] leading-[1.55]">{data.whyItMatters}</p>
      </div>
    </div>
  );
}

const BAR_GREYS = ["bg-neutral-100", "bg-neutral-200", "bg-neutral-300"];
