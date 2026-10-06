"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { formatFinancial, formatIDR, sourceHref } from "@/lib/format";
import { revenueSeries, type RevenueSeries } from "@/lib/revenue-series";
import { Select } from "@/components/ui/Select";

export function FinancialHistoryChart({ series, title = "Revenue and annual change" }: { series: RevenueSeries[]; title?: string }) {
  const tracks = series.map(revenueSeries);
  const plotted = tracks.flatMap((track) => track.points.filter((point) => point.rupiah !== null));
  const years = [...new Set(plotted.map((point) => point.year))].sort((a, b) => a - b);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.min(900, entry.contentRect.width))));
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const selected = years.includes(selectedYear ?? NaN) ? selectedYear! : years.at(-1);
  const enough = tracks.some((track) => track.points.filter((point) => point.rupiah !== null).length >= 2);
  const max = Math.max(1, ...plotted.map((point) => point.rupiah!)) * 1.12;
  const changes = plotted.flatMap((point) => point.change === null ? [] : [point.change]);
  const changeMax = Math.max(5, ...changes.map(Math.abs)) * 1.15;
  const left = 112, right = 26, top = 24, bottom = 36, height = 225;
  const x = (year: number) => left + (years.length < 2 ? (width - left - right) / 2 : (year - years[0]) / (years.at(-1)! - years[0]) * (width - left - right));
  const y = (value: number, change: boolean) => top + (change ? (changeMax - value) / (changeMax * 2) : (max - value) / max) * (height - top - bottom);
  const choose = (year: number) => setSelectedYear(year);
  const chart = (change: boolean) => <svg role="group" aria-label={change ? "Annual revenue change in percent" : "Annual revenue in Indonesian rupiah"} viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
    {[0, 1, 2, 3, 4].map((tick) => {
      const value = change ? -changeMax + changeMax * tick / 2 : max * tick / 4;
      return <g key={tick}><line x1={left} x2={width - right} y1={y(value, change)} y2={y(value, change)} stroke="var(--color-divider)" /><text x={left - 9} y={y(value, change) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{change ? `${value.toFixed(1)}%` : formatIDR(value)}</text></g>;
    })}
    {tracks.map((track, index) => {
      const color = ["#146c50", "#2867a0", "#7153a0", "#946419", "#466975"][index % 5];
      return <g key={track.company}>{track.points.map((point, i) => {
        const value = change ? point.change : point.rupiah;
        if (value === null) return null;
        const previous = track.points[i - 1];
        const previousValue = previous && (change ? previous.change : previous.rupiah);
        const pointX = x(point.year) + (change ? (index - (tracks.length - 1) / 2) * Math.min(10, (width - left - right) / Math.max(1, years.length) * .15) : 0);
        return <g key={point.year}>
          {!change && previousValue != null && point.change !== null ? <line x1={x(previous.year)} x2={x(point.year)} y1={y(previousValue, change)} y2={y(value, change)} stroke={color} strokeWidth="2" strokeDasharray={index ? "5 3" : undefined} /> : null}
          {change ? <line x1={pointX} x2={pointX} y1={y(0, true)} y2={y(value, true)} stroke={color} strokeWidth="5" strokeLinecap="round" /> : null}
          <g role="button" tabIndex={0} aria-label={`${track.company}, FY${point.year}: ${change ? `${value.toFixed(2)}% change` : formatIDR(value)}. Inspect reporting period.`} aria-describedby={id}
            onPointerEnter={() => choose(point.year)} onFocus={() => choose(point.year)} onClick={() => choose(point.year)} onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "Enter", " ", "Escape"].includes(event.key)) event.preventDefault();
              if (event.key === "Escape") setSelectedYear(null);
              else if (["Enter", " "].includes(event.key)) choose(point.year);
              else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                const year = years[Math.max(0, Math.min(years.length - 1, years.indexOf(point.year) + (event.key === "ArrowRight" ? 1 : -1)))];
                event.currentTarget.ownerSVGElement?.querySelector<SVGGElement>(`[data-chart="${change}"][data-company="${index}"][data-year="${year}"]`)?.focus(); choose(year);
              }
            }} data-chart={change} data-company={index} data-year={point.year} className="cursor-pointer">
            <circle cx={pointX} cy={y(value, change)} r="14" fill="transparent" /><circle className="rp-data-point" cx={pointX} cy={y(value, change)} r={selected === point.year ? 5 : 3.5} fill="var(--color-card)" stroke={color} strokeWidth="2.5" />
          </g>
        </g>;
      })}</g>;
    })}
    {years.filter((_, i) => width >= 500 || years.length <= 4 || i % 2 === 0 || i === years.length - 1).map((year) => <text key={year} x={x(year)} y={height - 10} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{year}</text>)}
  </svg>;
  return <section ref={root} className="min-w-0" aria-label={title}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-bold">{title}</h2>{enough ? <Select className="w-auto min-w-32" label="Inspect financial reporting period" value={String(selected ?? "")} onChange={(value) => choose(Number(value))} options={years.map((year) => ({ value: String(year), label: `FY${year}` }))} /> : null}</div>
    {enough ? <>
      <p className="mb-2 text-xs leading-relaxed text-muted">Annual revenue · IDR trillions. Changes compare adjacent annual periods with the same verified reporting scope.</p>
      <div className="mb-2 flex flex-wrap gap-4 text-xs font-bold">{tracks.map((track, index) => <span key={track.company} style={{ color: ["#146c50", "#2867a0", "#7153a0", "#946419", "#466975"][index % 5] }}>{track.company}</span>)}</div>
      {chart(false)}
      <h3 className="mt-3 text-sm font-semibold">Period-over-period revenue change</h3>
      {changes.length ? chart(true) : <p className="my-3 rounded-field bg-subtle p-3 text-xs leading-relaxed text-muted">Change percentages are unavailable: there are no adjacent annual periods with compatible reporting scope and a positive base value.</p>}
      <div id={id} role="status" className="mt-3 rounded-field border border-divider bg-subtle/60 p-3 text-xs leading-relaxed"><p className="font-bold">Reporting period FY{selected}</p>{tracks.map((track) => {
        const point = track.points.find((entry) => entry.year === selected);
        return <div key={track.company} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"><strong>{track.company}</strong><span>{point ? formatFinancial(point) : "No reported value"}</span><span>{point?.change != null ? `${point.change > 0 ? "+" : ""}${point.change.toFixed(2)}% YoY` : "Change unavailable"}</span>{point?.snapshotId ? <Link href={`/financial-sources/${point.snapshotId}`} className="font-bold text-accent-ink underline underline-offset-2">Source →</Link> : point && sourceHref(point.sourceUrl) ? <a href={sourceHref(point.sourceUrl)!} target="_blank" rel="noreferrer" className="font-bold text-accent-ink underline underline-offset-2">Source ↗</a> : null}</div>;
      })}</div>
    </> : <p className="rounded-field bg-subtle p-4 text-sm leading-relaxed text-muted">Insufficient coverage for a revenue chart. At least two annual values with verified IDR currency, source scale, and reporting scope are required. Other currencies need a supported exchange rate before conversion.</p>}
    {tracks.filter((track) => track.excluded > 0).map((track) => <p key={track.company} className="mt-2 text-xs leading-relaxed text-muted">{track.company}: {track.excluded} source {track.excluded === 1 ? "entry is" : "entries are"} excluded because its period, currency, scale, scope, or value could not be verified.</p>)}
    <p className="mt-3 text-xs leading-relaxed text-muted">Saved evidence only. Missing years and changes in scope break the line; no missing values are estimated. Hover, tap, or focus a point to inspect it.</p>
  </section>;
}
