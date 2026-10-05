"use client";

import { Minus } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

const STROKES = ["#E2650F", "#1F1E1C", "#8f8a80", "#2F7D62", "#6B5CE7"];

/**
 * One revenue-momentum graph for every listed competitor: each company's
 * cited revenue series indexed to 100 at its own first period, drawn on a
 * shared axis. Indexing is what makes unlike scales comparable — absolute
 * rupiah levels differ by orders of magnitude across companies.
 *
 * Only series captioned as revenue are drawn; anything else (ARPU, capex)
 * would fake comparability and is listed as excluded instead. The rigorous
 * absolute-figure comparison stays in each investigation's cited table.
 */
export function RevenueTrendGraph() {
  const { watchlist, signals, loading } = useStore();
  const companies = watchlist?.companies ?? [];
  const ourCompany = watchlist?.user_company ?? null;

  const tracks = companies.map((company, index) => {
    const owned = signals.filter((item) => item.company === company.ticker);
    const signal = owned.find((item) => /revenue/i.test(item.financialContext.seriesCaption));
    const series = signal?.financialContext.series ?? [];
    const values = series.map((point) => point.value);
    const first = values[0];
    const last = values[values.length - 1];
    const indexable = first !== undefined && first !== 0 && values.length > 1;
    const indexed = indexable
      ? values.map((value) => (value / (first as number)) * 100)
      : [];
    const change =
      indexable && last !== undefined
        ? ((last - (first as number)) / Math.abs(first as number)) * 100
        : null;
    return {
      company,
      signalCount: owned.length,
      isOurs: ourCompany === company.ticker,
      labels: series.map((point) => point.label),
      indexed,
      change,
      stroke: STROKES[index % STROKES.length],
    };
  });

  const comparable = tracks.filter((t) => t.indexed.length > 1);
  const excluded = tracks.filter((t) => t.indexed.length <= 1);
  const labelRow =
    [...comparable].sort((a, b) => b.labels.length - a.labels.length)[0]?.labels ?? [];

  if (!comparable.length) {
    return (
      <Card className="min-w-0">
        <CardHeader
          title="Revenue momentum"
          aside={<Pill tone="quiet">One graph · base 100</Pill>}
          className="mb-1 flex flex-wrap items-center justify-between gap-3"
        />
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <Minus aria-hidden size={13} />
          {loading
            ? "Loading financial context…"
            : signals.length === 0
              ? `Watchlist has ${companies.length} competitors but no stored signals yet — run an investigation first (e.g. “Compare competitor financial momentum”).`
              : "No citable revenue series yet — need ≥2 revenue points per competitor. Run a financial investigation first."}
        </p>
        {!loading ? (
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted">
            {tracks.map((t) => (
              <li key={t.company.ticker}>
                <span className="font-bold text-ink-2">{t.company.ticker}</span>
                {` · ${t.signalCount} signal${t.signalCount === 1 ? "" : "s"}`}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    );
  }

  const all = comparable.flatMap((t) => t.indexed);
  const min = Math.min(95, ...all);
  const max = Math.max(105, ...all);
  const width = 640;
  const height = 260;
  const padL = 44;
  const padR = 14;
  const padT = 12;
  const padB = 28;
  const span = Math.max(1, max - min);
  const x = (i: number, n: number) =>
    padL + (i / Math.max(1, n - 1)) * (width - padL - padR);
  const y = (v: number) =>
    height - padB - ((v - min) / span) * (height - padT - padB);

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Revenue momentum"
        aside={<Pill tone="quiet">One graph · base 100</Pill>}
        className="mb-1 flex flex-wrap items-center justify-between gap-3"
      />
      <p className="max-w-[72ch] text-[13px] leading-[1.55] text-muted">
        Every competitor indexed to 100 at its own first cited revenue period.
        Steeper means faster cited growth — not larger revenue.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {comparable.map((t) => (
          <span
            key={t.company.ticker}
            className="inline-flex items-center gap-1.5 text-xs font-bold"
          >
            <span
              aria-hidden
              className="inline-block h-[3px] w-5 rounded-full"
              style={{ background: t.stroke }}
            />
            {t.company.ticker}
            {t.isOurs ? " ★" : ""}
            <span className="font-semibold text-muted">
              {t.change !== null
                ? `${t.change >= 0 ? "+" : ""}${t.change.toFixed(1)}%`
                : "no series"}
            </span>
          </span>
        ))}
      </div>

      <svg
        role="img"
        aria-label={`Indexed revenue momentum from ${labelRow[0] ?? "first period"} to ${labelRow[labelRow.length - 1] ?? "latest period"}`}
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padL}
            x2={width - padR}
            y1={height * p}
            y2={height * p}
            stroke="var(--color-divider)"
            strokeWidth="1"
          />
        ))}
        <line
          x1={padL}
          x2={padL}
          y1={padT}
          y2={height - padB}
          stroke="var(--color-divider)"
          strokeWidth="1"
        />
        {[min, (min + max) / 2, max].map((v) => (
          <text
            key={v}
            x={padL - 6}
            y={y(v) + 4}
            textAnchor="end"
            fontSize="10"
            fill="var(--color-muted)"
          >
            {v.toFixed(0)}
          </text>
        ))}
        {comparable.map((t) => {
          const pts = t.indexed.map((v, i) => ({
            x: x(i, t.indexed.length),
            y: y(v),
          }));
          const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={t.company.ticker}>
              <polyline
                points={line}
                fill="none"
                stroke={t.stroke}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={i === pts.length - 1 ? 4 : 2.5}
                  fill="var(--color-card)"
                  stroke={t.stroke}
                  strokeWidth="2"
                >
                  <title>{`${t.company.ticker} · ${t.labels[i] ?? ""}: index ${t.indexed[i].toFixed(1)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {labelRow.map((label, i, arr) => (
          <text
            key={`${label}-${i}`}
            x={x(i, arr.length)}
            y={height - 8}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-muted)"
          >
            {label}
          </text>
        ))}
      </svg>

      {excluded.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted">
          Not drawn (no cited revenue series yet): {excluded.map((t) => t.company.ticker).join(", ")}.
          Non-revenue series are never indexed as revenue.
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-muted">
        Base 100 = each competitor&apos;s first cited revenue period.
        Periods align by order; unlike fiscal calendars are not ranked.
      </p>
    </Card>
  );
}
