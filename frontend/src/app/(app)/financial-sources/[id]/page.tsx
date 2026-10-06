"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { apiRequest } from "@/lib/http";
import { FinancialSourceSchema } from "@/lib/schemas";
import { dashboardTime, humanizeFigureMeta } from "@/lib/format";
import { Card, CardHeader, ErrorCard, PageTitle, Skeleton } from "@/components/ui/primitives";

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
  return <>
    <Link href="/watchlists" className="inline-flex min-h-11 items-center text-sm font-bold text-accent-ink">← Back to competitors</Link>
    <div><PageTitle>Financial source</PageTitle><p className="mt-2 text-sm text-muted">Stored annual financial evidence used in your workspace’s research.</p></div>
    {error?.id === id ? <ErrorCard message={error.message} onRetry={() => setAttempt((count) => count + 1)} /> : !statement ? <Card><Skeleton className="h-64 w-full" /></Card> : <>
      <Card><CardHeader title={`${statement.ticker} · ${statement.name}`} /><dl className="flex flex-wrap gap-x-10 gap-y-3 text-sm"><div><dt className="text-muted">Source</dt><dd className="mt-1 font-bold">{statement.provider}</dd></div><div><dt className="text-muted">Retrieved</dt><dd className="mt-1 font-bold">{dashboardTime(statement.fetchedAt)}</dd></div><div><dt className="text-muted">Evidence</dt><dd className="mt-1 font-bold">{statement.points.length} annual periods</dd></div></dl><p className="mt-4 border-t border-divider pt-4 text-xs leading-relaxed text-muted">This view reads saved evidence. It does not request new data or consume research credits. Figures retain the metadata supplied by the source.</p></Card>
      <Card><CardHeader title="Reported annual revenue" /><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">Annual revenue with exact source values and reporting metadata</caption><thead><tr className="border-b border-border text-xs text-muted">{["Year", "Exact revenue", "Currency / units", "YoY", "Reporting scope"].map((label) => <th className="px-3 py-3" scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{statement.points.map((point) => <tr key={point.year} className="border-b border-divider align-top"><th className="px-3 py-4" scope="row">{point.year}</th><td className="px-3 py-4 font-semibold tabular-nums">{point.value ?? "Conflicting values"}</td><td className="px-3 py-4 text-xs leading-relaxed">{point.currency ?? "Currency unspecified"}<br />{humanizeFigureMeta(point.unit)}</td><td className="px-3 py-4">{point.yoy === null ? "Unavailable" : `${point.yoy}%`}</td><td className="max-w-64 px-3 py-4 text-xs leading-relaxed">{humanizeFigureMeta(point.basis)}{point.limitation ? <p className="mt-1 text-muted">{point.limitation}</p> : null}</td></tr>)}</tbody></table></div>{statement.note ? <p className="mt-4 text-xs leading-relaxed text-muted">{statement.note}</p> : null}</Card>
      {statement.figures.length ? <Card><details><summary className="cursor-pointer text-sm font-bold">All reported financial figures · {statement.figures.length}</summary><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">Exact stored annual financial figures</caption><thead><tr className="border-b border-border text-xs text-muted">{["Year", "Metric", "Exact value", "Currency / units", "Reporting scope"].map((label) => <th scope="col" key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{[...statement.figures].sort((a, b) => b.period.localeCompare(a.period)).map((figure, index) => <tr className="border-b border-divider align-top" key={`${figure.metric}-${figure.period}-${index}`}><td className="px-3 py-4">{figure.period}</td><th scope="row" className="px-3 py-4 capitalize">{figure.metric.replaceAll("_", " ")}</th><td className="px-3 py-4 font-semibold tabular-nums">{figure.value}</td><td className="px-3 py-4 text-xs leading-relaxed">{figure.currency ?? (figure.unit === "percent" ? "Percentage" : "Currency unspecified")}<br />{humanizeFigureMeta(figure.unit)}</td><td className="px-3 py-4 text-xs leading-relaxed">{humanizeFigureMeta(figure.basis)}</td></tr>)}</tbody></table></div></details></Card> : null}
    </>}
  </>;
}
