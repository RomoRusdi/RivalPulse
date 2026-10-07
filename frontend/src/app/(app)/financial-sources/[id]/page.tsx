"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/http";
import { FinancialSourceSchema } from "@/lib/schemas";
import { dashboardTime, humanizeFigureMeta } from "@/lib/format";
import { PERFORMANCE_LABELS, percentageText, performancePeriod } from "@/lib/financial-performance";
import { FinancialHistoryChart } from "@/components/dashboard/FinancialHistoryChart";
import { FinancialValue } from "@/components/ui/FinancialValue";
import { Select } from "@/components/ui/Select";
import { Card, CardHeader, ErrorCard, Skeleton } from "@/components/ui/primitives";

type Statement = z.infer<typeof FinancialSourceSchema>;
const LABELS: Record<string, string> = { revenue: "Revenue", earnings: "Net profit", total_assets: "Total assets", total_equity: "Total equity" };
export default function FinancialSourcePage() {
  const { id } = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<{ id: string; statement: Statement } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/v1/financial-sources/${encodeURIComponent(id)}`, { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) { setLoaded({ id, statement: FinancialSourceSchema.parse(response) }); setError(null); }
    }).catch(() => { if (!controller.signal.aborted) setError({ id, message: "Company financials could not be loaded. Please retry." }); });
    return () => controller.abort();
  }, [id, attempt]);
  const statement = loaded?.id === id ? loaded.statement : null;
  return <div className="flex min-w-0 flex-col gap-5">
    <Link href="/watchlists" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent-ink"><ArrowLeft size={15} aria-hidden />Back to competitors</Link>
    {error?.id === id ? <ErrorCard message={error.message} onRetry={() => { setError(null); setAttempt((count) => count + 1); }} /> : !statement ? <div aria-label="Loading company financials" role="status"><Skeleton className="mb-4 h-24 w-full" /><Skeleton className="h-80 w-full" /></div> : <Report key={statement.id} statement={statement} />}
  </div>;
}

function Report({ statement }: { statement: Statement }) {
  const figures = statement.figures.length ? statement.figures : statement.points.map((point) => ({ ...point, metric: "revenue", period: String(point.year) }));
  const periods = [...new Set([...figures.map((figure) => figure.period), ...statement.performanceMetrics.filter((metric) => metric.periodKind === "annual").map((metric) => metric.period).filter((period): period is string => Boolean(period))])].sort().reverse();
  const [selected, setSelected] = useState(periods[0] ?? "");
  const metrics = [...new Set(figures.filter((figure) => figure.period === selected).map((figure) => figure.metric))];
  const values = metrics.map((metric) => {
    const entries = figures.filter((figure) => figure.period === selected && figure.metric === metric);
    const first = entries[0];
    const conflict = entries.some((entry) => entry.value !== first.value || entry.currency !== first.currency || entry.unit !== first.unit || entry.basis !== first.basis);
    return { ...first, value: conflict ? null : first.value, alternatives: conflict ? entries : undefined };
  });
  const unknown = figures.some((figure) => !figure.currency || /unverified|unknown|unspecified/i.test(figure.unit));
  const limitations = [...new Set([statement.note, ...statement.points.map((point) => point.limitation)].filter((text): text is string => Boolean(text)))];
  const annualRates = statement.performanceMetrics.filter((metric) => metric.periodKind === "annual" && metric.period === selected);
  const quarterly = statement.performanceMetrics.filter((metric) => metric.periodKind !== "annual");
  return <>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-divider pb-5">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-accent-ink">Company financials · {statement.ticker}</p><h1 className="break-words text-[clamp(23px,3vw,32px)] font-extrabold leading-tight tracking-tight">{statement.name}</h1><p className="mt-2 text-sm text-muted">Annual reporting{selected ? ` · FY${selected}` : " · Period not supplied"}</p></div>
      {periods.length ? <Select label="Company reporting year" value={selected} onChange={setSelected} options={periods.map((period) => ({ value: period, label: `FY${period}` }))} /> : null}
    </header>
    <div id="financial-report-information" className="rounded-field bg-subtle/70 px-4 py-3">
      <h2 className="text-xs font-bold text-ink-2">Report information</h2>
      <p className="mt-2 text-xs font-semibold text-ink-2">{statement.freshness.status === "historical" ? "Historical saved report" : "Saved report"} · Figures reflect the reporting periods shown.</p>
      <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted"><div><dt className="inline">Retrieved </dt><dd className="inline font-semibold">{dashboardTime(statement.fetchedAt)}</dd></div><div><dt className="inline">Coverage </dt><dd className="inline font-semibold">{periods.length} annual periods · {figures.length} figures</dd></div><div><dt className="inline">Data attribution </dt><dd className="inline font-semibold">{statement.provider}</dd></div></dl>
      {unknown ? <p className="mt-3 text-xs leading-relaxed text-muted">Currency or scale was not supplied for some figures. “Reported units” preserves the original scale; these amounts are excluded from monetary comparisons.</p> : null}
    </div>
    {values.length ? <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{values.filter((figure) => figure.metric in LABELS).map((figure) => <div key={figure.metric} className="rp-card min-w-0 rounded-card border border-border bg-card p-4"><dt className="mb-3 text-xs font-semibold text-muted">{LABELS[figure.metric]}</dt><dd><FinancialValue amount={figure} /></dd><p className="mt-2 text-xs text-muted">FY{figure.period}</p></div>)}</dl> : <Card><p className="text-sm text-muted">Annual monetary figures are not reported for this period. Available rates appear below.</p></Card>}
    {annualRates.length ? <Card><CardHeader title={`Profitability · FY${selected}`} /><dl className="grid gap-4 sm:grid-cols-2">{annualRates.map((metric, index) => <div key={`${metric.metric}-${index}`}><dt className="text-xs text-muted">{PERFORMANCE_LABELS[metric.metric] ?? metric.metric.replaceAll("_", " ")}</dt><dd className="mt-2 text-xl font-bold tabular-nums">{percentageText(metric.value, false)}</dd>{metric.reasons.includes("scope_change") ? <p className="mt-1 text-xs text-muted">Reporting scope changed.</p> : null}</div>)}</dl></Card> : null}
    <Card><FinancialHistoryChart emptyAction={<a href="#financial-report-information" className="inline-flex min-h-10 items-center text-xs font-bold text-accent-ink">Review report information →</a>} series={[{ company: statement.ticker, note: statement.note, points: statement.points.map((point) => ({ ...point, period: String(point.year) })) }]} /></Card>
    {quarterly.length ? <Card><details><summary className="cursor-pointer text-sm font-bold">Quarterly growth</summary><p className="mt-3 text-xs text-muted">Quarterly rates compare with the same quarter a year earlier. A missing quarter does not establish a current trend.</p><dl className="mt-4 grid gap-4 sm:grid-cols-2">{quarterly.map((metric, index) => <div key={`${metric.metric}-${index}`} className="rounded-field bg-subtle/60 p-3"><dt className="text-xs text-muted">{PERFORMANCE_LABELS[metric.metric] ?? metric.metric}</dt><dd className="mt-2 text-lg font-bold tabular-nums">{percentageText(metric.value)}</dd><p className="mt-1 text-xs text-muted">{performancePeriod(metric)}</p></div>)}</dl></details></Card> : null}
    {values.length ? <Card><CardHeader title={`Reported figures · FY${selected}`} /><dl className="divide-y divide-divider">{values.map((figure) => <div key={figure.metric} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(120px,1fr)_minmax(0,2fr)]"><dt className="text-sm capitalize text-muted">{LABELS[figure.metric] ?? figure.metric.replaceAll("_", " ")}</dt><dd><FinancialValue amount={figure} /><p className="mt-2 text-xs text-muted">{humanizeFigureMeta(figure.basis)}</p></dd></div>)}</dl></Card> : null}
    <Card><details><summary className="cursor-pointer text-sm font-bold">Coverage and limitations</summary><div className="mt-3 space-y-3 text-xs leading-relaxed text-muted">{limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}<p>Annual figures provide financial context; they do not establish a marketing cause. Changes in reporting scope are excluded from growth calculations.</p><p>Viewing this saved report consumes no research credits.</p></div></details></Card>
  </>;
}
