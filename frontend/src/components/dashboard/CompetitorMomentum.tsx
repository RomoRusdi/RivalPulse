"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardHeader, Pill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

const STROKES = ["var(--color-accent)", "var(--color-ink-strong)", "#8f8a80"];

export function CompetitorMomentum() {
  const { watchlist, signals, loading } = useStore();

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Competitor financial momentum"
        aside={<Pill tone="quiet">Revenue index · base 100</Pill>}
        className="mb-1 flex flex-wrap items-center justify-between gap-3"
      />
      <p className="max-w-[72ch] text-[13px] leading-[1.55] text-muted">
        Annual revenue movement from each competitor&apos;s cited financial context.
        This is a comparison index, not a share-price chart.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {(watchlist?.companies ?? []).map((company, index) => {
          const signal = signals.find((item) => item.company === company.ticker);
          const series = signal?.financialContext.series ?? [];
          const values = series.map((point) => point.value);
          const first = values[0];
          const last = values[values.length - 1];
          const indexed =
            first && values.length > 1
              ? values.map((value) => (value / first) * 100)
              : [];
          const change =
            first && last !== undefined ? ((last - first) / Math.abs(first)) * 100 : null;

          return (
            <article
              key={company.ticker}
              className="group rounded-detail border border-divider bg-subtle/55 p-3.5 transition-console hover:border-neutral-300 hover:bg-subtle"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold tracking-[0.02em]">
                    {company.ticker}
                  </p>
                  <p className="truncate text-xs text-muted">{company.name}</p>
                </div>
                {change !== null ? (
                  <span className="flex shrink-0 items-center gap-1 text-[13px] font-extrabold text-accent-ink">
                    {change >= 0 ? (
                      <ArrowUpRight aria-hidden size={14} strokeWidth={2.2} />
                    ) : (
                      <ArrowDownRight aria-hidden size={14} strokeWidth={2.2} />
                    )}
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}%
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-muted">
                    <Minus aria-hidden size={13} /> No series
                  </span>
                )}
              </div>

              {indexed.length > 1 ? (
                <MomentumChart
                  values={indexed}
                  labels={series.map((point) => point.label)}
                  stroke={STROKES[index % STROKES.length]}
                  id={company.ticker.toLowerCase()}
                />
              ) : (
                <div className="mt-4 flex h-[92px] items-center justify-center rounded-field border border-dashed border-border bg-card text-xs text-muted">
                  Awaiting comparable periods
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-2 border-t border-divider pt-2 text-[11px] text-muted">
                <span>{series[0]?.label ?? "First period"}</span>
                <span className="font-bold text-ink-2">
                  {indexed.length ? `${indexed[indexed.length - 1].toFixed(0)} index` : "No data"}
                </span>
                <span>{series[series.length - 1]?.label ?? "Latest period"}</span>
              </div>
            </article>
          );
        })}

        {!loading && !watchlist ? (
          <p className="text-sm text-muted">No watchlist financial context is available.</p>
        ) : null}
      </div>
    </Card>
  );
}

function MomentumChart({
  values,
  labels,
  stroke,
  id,
}: {
  values: number[];
  labels: string[];
  stroke: string;
  id: string;
}) {
  const width = 260;
  const height = 92;
  const padding = 10;
  const min = Math.min(95, ...values);
  const max = Math.max(105, ...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return { x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding},${height - padding} ${line} ${width - padding},${height - padding}`;

  return (
    <svg
      role="img"
      aria-label={`Revenue index from ${labels[0]} to ${labels[labels.length - 1]}`}
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-[92px] w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`momentum-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="1" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((position) => (
        <line
          key={position}
          x1={padding}
          x2={width - padding}
          y1={height * position}
          y2={height * position}
          stroke="var(--color-divider)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <polygon points={area} fill={`url(#momentum-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="rp-chart-line"
      />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}`}
          cx={point.x}
          cy={point.y}
          r={index === points.length - 1 ? 4 : 3}
          fill="var(--color-card)"
          stroke={stroke}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className={cx(index === points.length - 1 && "rp-chart-point")}
        />
      ))}
    </svg>
  );
}
