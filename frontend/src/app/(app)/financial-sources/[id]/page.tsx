"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { apiRequest } from "@/lib/http";
import { FinancialSourceSchema } from "@/lib/schemas";
import { dashboardTime, formatFinancial, humanizeFigureMeta, sourceHref } from "@/lib/format";
import { PERFORMANCE_LABELS, percentageText, performancePeriod } from "@/lib/financial-performance";
import { FinancialHistoryChart } from "@/components/dashboard/FinancialHistoryChart";
import { Card, CardHeader, ErrorCard, Skeleton } from "@/components/ui/primitives";

type Statement = z.infer<typeof FinancialSourceSchema>;
export default function FinancialSourcePage() {
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<{ id: string; statement: Statement } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/v1/financial-sources/${encodeURIComponent(id)}`, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) { setLoaded({ id, statement: FinancialSourceSchema.parse(response) }); setError(null); }
    }).catch((cause) => { if (!controller.signal.aborted) setError({ id, message: cause instanceof Error ? cause.message : "Financial data could not be loaded." }); });
    return () => controller.abort();
  }, [id, attempt]);
  const statement = loaded?.id === id ? loaded.statement : null;
  return <div className="flex min-w-0 flex-col gap-5">
    <Link href="/watchlists" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent-ink"><ArrowLeft size={15} aria-hidden />Back to competitors</Link>
    {error?.id === id ? <ErrorCard message={error.message} onRetry={() => { setError(null); setAttempt((count) => count + 1); }} /> : !statement ? <div aria-label="Loading financial report" role="status"><Skeleton className="mb-4 h-24 w-full" /><Skeleton className="h-80 w-full" /><span className="sr-only">Loading saved financial evidence…</span></div> : <Report statement={statement} />}
  </div>;
}

function Report({ statement }: { statement: Statement }) {
  const periods = [...new Set([...statement.points.map((point) => String(point.year)), ...statement.figures.map((figure) => figure.period)])].sort();
  const latest = periods.at(-1);
  const figures = statement.figures.length ? statement.figures : statement.points.map((point) => ({ ...point, metric: "revenue", period: String(point.year), jsonPointer: null }));
  const keyFigures = ["revenue", "earnings", "total_assets", "total_equity"].flatMap((metric) => {
    const values = figures.filter((figure) => figure.metric === metric).sort((a, b) => b.period.localeCompare(a.period));
    const figure = values[0];
    if (!figure) return [];
    const conflict = values.some((value) => value.period === figure.period && (value.value !== figure.value || value.currency !== figure.currency || value.unit !== figure.unit || value.basis !== figure.basis));
    return [{ ...figure, value: conflict ? null : figure.value }];
  });
  const sources = [...new Set([...statement.points.map((point) => point.sourceUrl), ...statement.performanceMetrics.map((metric) => metric.sourceUrl)])].filter((url) => sourceHref(url));
  const limitations = [...new Set([statement.note, ...statement.points.map((point) => point.limitation)].filter((text): text is string => Boolean(text)))];
  const unknown = figures.some((figure) => !figure.currency || /unverified|unknown|unspecified/i.test(figure.unit));
  return <>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-5">
      <div className="min-w-0"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-accent-ink">Financial source · {statement.ticker}</p><h1 className="break-words text-[clamp(23px,3vw,32px)] font-extrabold leading-tight tracking-tight">{statement.name}</h1><p className="mt-2 text-sm text-muted">{periods.length ? `Annual reporting · FY${periods[0]}${periods.length > 1 ? ` – FY${latest}` : ""}` : "Reporting periods not supplied"}</p></div>
      <span className="rounded-full border border-accent-wash-border bg-accent-wash px-3 py-1.5 text-xs font-semibold text-accent-ink">Saved evidence</span>
    </header>
    {keyFigures.length ? <dl className={`grid min-w-0 gap-3 sm:grid-cols-2 ${keyFigures.length > 2 ? "xl:grid-cols-4" : ""}`}>{keyFigures.map((figure) => <div key={figure.metric} className="rp-card min-w-0 rounded-card border border-border bg-card p-4"><dt className="text-xs font-semibold capitalize text-muted">{figure.metric.replaceAll("_", " ")}</dt><dd className="mt-2 break-words text-xl font-extrabold tabular-nums" title={`${formatFinancial(figure)} · source scale: ${figure.unit}`}>{formatFinancial(figure)}</dd><p className="mt-2 text-xs text-muted">FY{figure.period} · {humanizeFigureMeta(figure.basis)}</p></div>)}</dl> : <Card><p className="text-sm text-muted">This report does not contain annual monetary figures. Available performance rates and source details are shown below.</p></Card>}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card className="min-w-0"><FinancialHistoryChart series={[{ company: statement.ticker, note: statement.note, points: statement.points.map((point) => ({ ...point, period: String(point.year) })) }]} /></Card>
        {statement.performanceMetrics.length ? <Card><CardHeader title="Reported performance" /><dl className="grid gap-4 sm:grid-cols-2">{statement.performanceMetrics.map((metric, index) => <div key={`${metric.metric}-${metric.period}-${index}`} className="min-w-0 rounded-field bg-subtle/60 p-3"><dt className="text-xs leading-relaxed text-muted">{PERFORMANCE_LABELS[metric.metric] ?? metric.metric.replaceAll("_", " ")}</dt><dd className="mt-2 text-xl font-bold tabular-nums">{percentageText(metric.value, metric.metric !== "net_profit_margin")}</dd><p className="mt-1 text-xs text-muted">{performancePeriod(metric)}</p><details className="mt-3 text-xs"><summary className="font-semibold text-accent-ink">Source calculation</summary><p className="mt-2 leading-relaxed">Reported fraction {metric.rawValue} × 100, rounded to two decimal places.</p><p className="mt-2 break-all font-mono text-[11px] text-muted">{metric.jsonPointer}</p>{metric.displayStatus === "conflict" ? <p className="mt-2 text-muted">Conflicting entries in the source report.</p> : null}{metric.reasons.includes("scope_change") ? <p className="mt-2 text-muted">Reporting scope changed; this does not establish organic growth.</p> : null}</details></div>)}</dl></Card> : null}
        {figures.length ? <Card className="min-w-0"><CardHeader title="Financial figures by period" /><div className="hidden sm:block"><table className="w-full table-fixed text-left text-xs"><caption className="sr-only">Financial figures with source scale and reporting scope</caption><thead><tr className="border-b border-border text-muted">{["Period / metric", "Reported figure", "Source details"].map((label) => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr></thead><tbody>{[...figures].sort((a, b) => b.period.localeCompare(a.period)).map((figure, index) => <tr key={`${figure.metric}-${figure.period}-${index}`} className="border-b border-divider align-top"><th scope="row" className="break-words px-2 py-3">FY{figure.period}<span className="mt-1 block font-normal capitalize text-muted">{figure.metric.replaceAll("_", " ")}</span></th><td className="break-words px-2 py-3 font-bold tabular-nums" title={`${formatFinancial(figure)} · source scale: ${figure.unit}`}>{formatFinancial(figure)}</td><td className="break-words px-2 py-3 leading-relaxed text-muted">{figure.currency ?? "Currency unspecified"} · {humanizeFigureMeta(figure.unit)}<p>{humanizeFigureMeta(figure.basis)}</p>{figure.jsonPointer ? <code className="mt-1 block break-all text-[10px]">{figure.jsonPointer}</code> : null}</td></tr>)}</tbody></table></div><dl className="divide-y divide-divider sm:hidden">{[...figures].sort((a, b) => b.period.localeCompare(a.period)).map((figure, index) => <div key={`${figure.metric}-${figure.period}-${index}`} className="py-3"><dt className="text-xs capitalize text-muted">FY{figure.period} · {figure.metric.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm font-bold tabular-nums">{formatFinancial(figure)}</dd><p className="mt-1 text-xs leading-relaxed text-muted">Source scale: {humanizeFigureMeta(figure.unit)} · {humanizeFigureMeta(figure.basis)}</p></div>)}</dl></Card> : null}
      </div>
      <aside className="min-w-0 space-y-5">
        <Card><h2 className="flex items-center gap-2 text-base font-bold"><FileText size={16} aria-hidden />Source details</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs text-muted">Provider</dt><dd className="mt-1 font-semibold">{statement.provider}</dd></div><div><dt className="text-xs text-muted">Retrieved</dt><dd className="mt-1 font-semibold">{dashboardTime(statement.fetchedAt)}</dd></div><div><dt className="text-xs text-muted">Coverage</dt><dd className="mt-1 font-semibold">{periods.length} annual periods · {figures.length} figures</dd></div></dl>{sources.map((url, index) => <a key={url} href={sourceHref(url)!} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-10 items-center justify-between gap-2 rounded-field border border-accent-wash-border bg-accent-wash px-3 text-xs font-bold text-accent-ink"><span className="min-w-0 break-words">Original source {index + 1} · {new URL(url).hostname}</span><ExternalLink size={13} aria-hidden /></a>)}<details className="mt-4 text-xs text-muted"><summary className="font-semibold">Stored evidence record</summary><p className="mt-2 break-all font-mono">{statement.id}</p></details></Card>
        <Card><h2 className="text-base font-bold">Coverage and limitations</h2><div className="mt-3 space-y-3 text-xs leading-[1.8] text-ink-2">{unknown ? <p>Currency or scale is missing for some figures. Those values retain their source metadata and are excluded from IDR charts. No exchange rate is assumed.</p> : null}{limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}<p>Annual financial context does not establish the cause of a competitor’s marketing performance. Periods with different reporting scopes are not used to calculate change.</p><p>This page reads saved evidence and consumes no research credits.</p></div></Card>
      </aside>
    </div>
  </>;
}
