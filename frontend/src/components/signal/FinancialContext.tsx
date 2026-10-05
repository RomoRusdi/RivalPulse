"use client";

import { useEffect, useMemo, useState } from "react";
import { Eyebrow, cx } from "@/components/ui/primitives";
import { compactFinancial, isCannedHypothesis } from "@/lib/format";
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

  // Bars are relative to the largest cited value, never raw percentages:
  // absolute rupiah figures would otherwise render as million-percent bars.
  const max = Math.max(0, ...data.series.map((point) => point.value));

  // The metrics list carries every period-metric pair the run cited (30+
  // cards for an 8-year history). Show the latest period — the chart above
  // already tells the history — with the rest one click away. Metrics
  // without a period suffix (mock labels like "Revenue YoY") always show.
  const [showAllPeriods, setShowAllPeriods] = useState(false);
  const latestPeriod = useMemo(() => {
    const years = data.metrics.flatMap((metric) => {
      const match = /·\s*(\d{4})\s*$/.exec(metric.label);
      return match ? [match[1]] : [];
    });
    return years.length ? years.sort().at(-1) : null;
  }, [data.metrics]);
  const visibleMetrics =
    latestPeriod && !showAllPeriods
      ? data.metrics.filter((metric) => {
        const match = /·\s*(\d{4})\s*$/.exec(metric.label);
        return !match || match[1] === latestPeriod;
      })
      : data.metrics;
  const hiddenCount = data.metrics.length - visibleMetrics.length;

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
              title={`${point.label}: ${point.value}`}
              className={cx(
                "flex-1 rounded-bar transition-chart",
                point.highlight ? "bg-accent" : BAR_GREYS[index % 3],
              )}
              style={{ height: mounted && max > 0 ? `${Math.max(0, (point.value / max) * 100)}%` : "0%" }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between gap-1 text-xs text-muted">
          {data.series.map((point) => (
            <span key={point.label} title={`${point.label}: ${point.value}`} className="min-w-0 flex-1 truncate text-center first:text-left last:text-right">
              {point.label}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted">
          Bars relative to the largest cited value · hover a bar for its figure.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {visibleMetrics.map((metric) => (
          <div
            key={metric.label}
            className="flex-[1_1_120px] rounded-detail border border-border bg-card p-4"
          >
            <p
              title={metric.value}
              className={cx(
                "text-[22px] font-extrabold tracking-[-0.03em]",
                metric.accent ? "text-accent" : "text-ink",
              )}
            >
              {compactFinancial(metric.value)}
            </p>
            <p className="text-xs text-muted">{metric.label}</p>
          </div>
        ))}
      </div>
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAllPeriods((open) => !open)}
          aria-expanded={showAllPeriods}
          className="cursor-pointer self-start text-[13px] font-bold text-accent-ink transition-console hover:text-accent"
        >
          {showAllPeriods
            ? "Show latest period only"
            : `Show all periods (${hiddenCount} more figures)`}
        </button>
      ) : null}

      {isCannedHypothesis(data.whyItMatters) ? null : (
        <div className="rounded-detail border border-accent-wash-border bg-accent-wash p-[18px]">
          <Eyebrow className="text-accent-ink">Why marketing should care</Eyebrow>
          <p className="mt-2 text-[15px] leading-[1.55]">{data.whyItMatters}</p>
        </div>
      )}
    </div>
  );
}

const BAR_GREYS = ["bg-neutral-100", "bg-neutral-200", "bg-neutral-300"];
