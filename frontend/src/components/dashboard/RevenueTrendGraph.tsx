"use client";
import Link from "next/link";
import { Select } from "@/components/ui/Select";
import { useEffect, useId, useRef, useState } from "react";
import { Card, CardHeader, ErrorCard, Skeleton, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { getRevenue } from "@/lib/api";
import { compactFinancial, dashboardTime, humanizeFigureMeta, sourceHref } from "@/lib/format";

type Feed = Awaited<ReturnType<typeof getRevenue>>;
type Point = Feed["companies"][number]["points"][number];
const COLORS = ["#146C50", "#2867A0", "#7153A0", "#946419", "#466975"];
const colorFor = (ticker: string) => COLORS[[...ticker].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) >>> 0, 0) % COLORS.length];
const valueText = (p: Point) => p.value === null ? "Conflicting source values" : `${p.value} ${p.currency ?? "currency unspecified"} ${humanizeFigureMeta(p.unit)}`;

export function RevenueTrendGraph() {
  const { watchlist, aggregates, activeRun } = useStore();
  const [loaded, setLoaded] = useState<{ key: string; feed: Feed } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"indexed" | "absolute">("indexed");
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const inspectorId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(840);
  const key = `${watchlist?.id}:${watchlist?.companies.map((c) => c.ticker).join(",")}:${aggregates?.lastRunAt}:${activeRun?.status}:${attempt}`;
  useEffect(() => {
    if (!watchlist) return;
    const controller = new AbortController();
    getRevenue(watchlist, controller.signal).then((feed) => {
      if (!controller.signal.aborted) { setLoaded({ key, feed }); setFailure(null); }
    }).catch((cause) => { if (!controller.signal.aborted) setFailure({ key, message: cause instanceof Error ? cause.message : "Financial reports could not be loaded." }); });
    return () => controller.abort();
    // The key captures membership and research updates, not hover state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    const node = chartRef.current;
    if (!node || !window.ResizeObserver) return;
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(360, Math.min(840, entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, [loaded?.key, key]);
  if (failure?.key === key) return <ErrorCard message={failure.message} onRetry={() => setAttempt((count) => count + 1)} />;
  if (!loaded || loaded.key !== key) return <Card><Skeleton className="h-64 w-full" /></Card>;
  const feed = loaded.feed;
  const view = (mode === "absolute" && feed.absoluteAvailable) || (feed.baseYear === null && feed.absoluteAvailable) ? "absolute" : "indexed";
  const tracks = feed.companies.map((company, i) => ({ ...company, color: colorFor(company.ticker), dash: ["", "7 3", "2 3", "10 3 2 3", "5 4"][i % 5],
    drawn: company.points.filter((p) => p.comparable && (view === "absolute" || p.index !== null))
      .map((p) => ({ ...p, plotted: Number(view === "absolute" ? p.value : p.index) }))
      .filter((p) => Number.isFinite(p.plotted) && p.plotted >= 0),
  }));
  const years = [...new Set(tracks.flatMap((t) => t.drawn.map((p) => p.year)))].sort((a, b) => a - b);
  const values = tracks.flatMap((t) => t.drawn.map((p) => p.plotted));
  const charted = values.length > 0;
  const min = view === "absolute" ? 0 : Math.floor(Math.min(90, ...values) / 10) * 10;
  const max = view === "absolute" ? Math.max(1, ...values) * 1.1 : Math.ceil(Math.max(110, ...values) / 10) * 10;
  const w = chartWidth, h = 310, left = 72, right = 24, top = 24, bottom = 40;
  const x = (year: number) => left + (years.length < 2 ? (w - left - right) / 2 : (year - years[0]) / (years.at(-1)! - years[0]) * (w - left - right));
  const y = (value: number) => h - bottom - (value - min) / Math.max(1, max - min) * (h - top - bottom);
  const selected = years.includes(activeYear ?? NaN) ? activeYear : null;
  const units = tracks.flatMap((t) => t.drawn)[0];
  const choose = (year: number | null) => { setActiveYear(year); setPinned(year !== null); };
  return <Card className="min-w-0">
    <CardHeader title="Revenue momentum" aside={<span className="text-xs font-semibold text-muted">Annual financial reports</span>} />
    <p className="text-sm leading-relaxed text-muted">{view === "indexed" ? `Revenue indexed to ${feed.baseYear ?? "a shared reporting year"} = 100. Compare growth across verified reporting scopes.` : `Reported revenue in ${units?.currency ?? "the source currency"} · ${humanizeFigureMeta(units?.unit ?? "units as reported")}. The value axis starts at zero.`}</p>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Revenue chart view" className="inline-flex rounded-field border border-border bg-subtle p-1">{(["indexed", "absolute"] as const).map((option) => <button type="button" key={option} aria-pressed={view === option} disabled={option === "absolute" ? !feed.absoluteAvailable : feed.baseYear === null} onClick={() => { setMode(option); choose(null); }} className={cx("min-h-10 rounded-[7px] px-3 text-xs font-bold transition-console disabled:opacity-45", view === option ? "bg-card text-accent-ink shadow-sm" : "text-muted hover:text-ink")}>{option === "indexed" ? "Indexed growth" : "Reported revenue"}</button>)}</div>
      {charted ? <div className="flex items-center gap-2 text-xs font-semibold text-muted"><span className="shrink-0">Inspect year</span><Select className="min-w-40" label="Inspect reporting year" value={String(selected ?? "")} onChange={(year) => choose(year ? Number(year) : null)} options={[{ value: "", label: "Choose a year" }, ...years.map((year) => ({ value: String(year), label: String(year) }))]} /></div> : null}
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2">{tracks.map((t) => <span key={t.ticker} className="inline-flex items-center gap-2 text-xs font-bold"><svg aria-hidden width="20" height="5"><line x1="0" x2="20" y1="2" y2="2" stroke={t.color} strokeWidth="3" strokeDasharray={t.dash} /></svg>{t.ticker}{watchlist?.user_company === t.ticker ? " ★" : ""}<span className="font-normal text-muted">{t.drawn.length ? `${t.drawn.length} periods` : "comparison unavailable"}</span></span>)}</div>
    {charted ? <div ref={chartRef} className="relative mt-3" onPointerLeave={() => { if (!pinned) setActiveYear(null); }}>
      <svg key={view} role="group" aria-label={`Annual revenue, ${years[0]} to ${years.at(-1)}, ${view}`} viewBox={`0 0 ${w} ${h}`} className="rp-fade h-auto min-h-48 w-full">
        {[0, 1, 2, 3, 4].map((tick) => { const value = min + (max - min) * tick / 4; return <g key={tick}><line x1={left} x2={w - right} y1={y(value)} y2={y(value)} stroke="var(--color-divider)" /><text x={left - 8} y={y(value) + 4} textAnchor="end" fontSize="12" fill="var(--color-muted)">{view === "indexed" ? value.toLocaleString("en", { maximumFractionDigits: 1 }) : compactFinancial(String(Number(value.toPrecision(3)))).replace("≈", "")}</text></g>; })}
        {selected !== null ? <line x1={x(selected)} x2={x(selected)} y1={top} y2={h - bottom} stroke="var(--color-muted)" strokeDasharray="3 5" /> : null}
        {tracks.map((t) => {
          const segments: typeof t.drawn[] = [];
          t.drawn.forEach((p) => { const last = segments.at(-1)?.at(-1); if (!last || p.year !== last.year + 1 || p.basis !== last.basis || p.limitation) segments.push([]); segments.at(-1)!.push(p); });
          return <g key={t.ticker}>{segments.map((segment, i) => <polyline key={i} points={segment.map((p) => `${x(p.year)},${y(p.plotted)}`).join(" ")} fill="none" stroke={t.color} strokeWidth="2.5" strokeDasharray={t.dash} strokeLinecap="round" strokeLinejoin="round" />)}
            {t.drawn.map((p) => <g key={p.year} role="button" tabIndex={0} aria-label={`${t.ticker}, ${p.year}, revenue ${valueText(p)}. Inspect this year.`} aria-describedby={selected === p.year ? inspectorId : undefined}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") { setPinned(false); setActiveYear(p.year); } }} onFocus={() => setActiveYear(p.year)} onClick={() => choose(selected === p.year && pinned ? null : p.year)}
              onKeyDown={(e) => { if (["ArrowLeft", "ArrowRight", "Enter", " ", "Escape"].includes(e.key)) e.preventDefault(); if (e.key === "Escape") choose(null); else if (e.key === "Enter" || e.key === " ") choose(p.year); else if (e.key === "ArrowLeft" || e.key === "ArrowRight") choose(years[Math.max(0, Math.min(years.length - 1, years.indexOf(selected ?? p.year) + (e.key === "ArrowRight" ? 1 : -1)))]); }} className="cursor-pointer outline-none">
              <circle cx={x(p.year)} cy={y(p.plotted)} r="14" fill="transparent" /><circle className="rp-data-point" cx={x(p.year)} cy={y(p.plotted)} r={selected === p.year ? 6 : 4} fill="var(--color-card)" stroke={t.color} strokeWidth="2.5" />
            </g>)}
          </g>;
        })}
        {years.map((year) => <text key={year} x={x(year)} y={h - 12} textAnchor="middle" fontSize="12" fill="var(--color-muted)">{year}</text>)}
      </svg>
      {selected !== null ? <div id={inspectorId} role="status" className="rp-point-inspector pointer-events-none relative mt-3 w-full sm:absolute sm:top-2 sm:left-2 sm:z-10 sm:mt-0 sm:w-[min(340px,calc(100%-16px))] rounded-detail border border-border bg-card/95 p-3 shadow-frame"><p className="mb-2 text-xs font-extrabold">Reporting year {selected}</p>{tracks.map((t) => { const p = t.points.find((item) => item.year === selected); return <div key={t.ticker} className="border-t border-divider py-2 text-xs"><p className="font-bold" style={{ color: t.color }}>{t.ticker} <span className="font-normal text-ink">{p ? valueText(p) : "No reported value"}</span></p>{p ? <><p className="mt-1 text-muted">{p.yoy !== null ? `YoY ${p.yoy}%` : "YoY unavailable"}{p.index !== null ? ` · Index ${p.index}` : ""}</p><p className="mt-1 text-[11px] text-muted">Retrieved {dashboardTime(p.fetchedAt)} · {sourceHref(p.sourceUrl) ? new URL(p.sourceUrl).hostname : "source unavailable"}</p></> : null}</div>; })}</div> : null}
    </div> : <p className="mt-5 rounded-field bg-subtle p-4 text-sm leading-relaxed text-muted">{feed.companies.some((c) => c.points.length) ? "A comparison is unavailable because reporting metadata or a shared base year could not be verified. The source values are shown below." : "No stored annual revenue reports yet. Start a financial investigation to collect cited reports."}</p>}
    <p className="mt-3 text-xs text-muted">Missing years and scope changes break lines. Hover, tap, or focus a point to inspect a year. Arrow keys move between years; Escape clears the inspector. The table retains exact source values.</p>
    <details open={!charted || sourcesOpen} onToggle={(event) => setSourcesOpen(event.currentTarget.open)} className="mt-4 border-t border-divider pt-4"><summary className="cursor-pointer text-sm font-bold">Revenue data and sources</summary><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><caption className="sr-only">Annual revenue values, reporting metadata and source links</caption><thead><tr className="border-b border-border text-muted">{["Company / year", "Reported revenue", "YoY", "Reporting scope", "Source"].map((label) => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr></thead><tbody>{tracks.flatMap((t) => t.points.map((p) => <tr key={`${t.ticker}-${p.year}`} className="border-b border-divider align-top"><th scope="row" className="px-2 py-3 font-bold">{t.ticker} · {p.year}</th><td className="px-2 py-3 tabular-nums">{valueText(p)}</td><td className="px-2 py-3">{p.yoy === null ? "Unavailable" : `${p.yoy}%`}</td><td className="max-w-[220px] px-2 py-3 leading-relaxed">{humanizeFigureMeta(p.basis)}{p.limitation ? <p className="mt-1 text-muted">{p.limitation}</p> : null}</td><td className="px-2 py-3">{p.snapshotId ? <Link className="font-semibold text-accent-ink" href={`/financial-sources/${p.snapshotId}`}>View financial data →</Link> : "Source viewer unavailable"}<p className="mt-1 text-muted">{dashboardTime(p.fetchedAt)}</p></td></tr>))}</tbody></table></div></details>
    {tracks.filter((t) => !t.points.length).map((t) => <p key={t.ticker} className="mt-2 text-xs text-muted">{t.ticker}: no revenue report collected.</p>)}
    {tracks.filter((t) => /merger|scope change|acquisition/i.test(t.note)).map((t) => <p key={t.ticker} className="mt-2 text-xs leading-relaxed text-muted">{t.ticker}: {t.note}</p>)}
  </Card>;
}
