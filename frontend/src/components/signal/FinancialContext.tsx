"use client";
import { Select } from "@/components/ui/Select";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/primitives";
import { compactFinancial, humanizeFigureMeta, sourceHref } from "@/lib/format";
import type { FinancialContext as FinancialContextData } from "@/lib/types";

const LABELS: Record<string, string> = { revenue: "Revenue", earnings: "Earnings", total_assets: "Total assets", total_equity: "Total equity", ebitda: "EBITDA", revenue_growth_percent: "Revenue growth" };
export function FinancialContext({ data }: { data: FinancialContextData }) {
  const rows = data.rows ?? data.metrics.map((item) => {
    const parts = item.label.split(" · ");
    return { metric: parts[0], period: parts[1] ?? "Not specified", value: item.value, currency: null, unit: "unverified", basis: "", sourceUrl: "", snapshotId: null };
  });
  const periods = [...new Set(rows.map((item) => item.period))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const [selected, setSelected] = useState("");
  const period = periods.includes(selected) ? selected : periods[0];
  const visible = rows.filter((item) => item.period === period);
  const revenueRows = rows.filter((item) => item.metric === "revenue").sort((a, b) => a.period.localeCompare(b.period));
  const max = Math.max(0, ...revenueRows.map((item) => Number(item.value)));
  const comparable = revenueRows.length > 1 && revenueRows.every((item) => item.currency && item.unit !== "provider_native_unspecified" && item.unit !== "unverified" && item.basis && !item.basis.includes("unverified") && item.unit === revenueRows[0].unit && item.currency === revenueRows[0].currency && item.basis === revenueRows[0].basis && Number.isFinite(Number(item.value)) && Number(item.value) >= 0);
  if (!rows.length) return <Card><h2 className="text-lg font-bold">Financial context</h2><p className="mt-2 text-sm text-muted">No verified financial figures were available for this finding.</p></Card>;
  const renderRows = (entries: typeof rows) => <dl className="divide-y divide-divider">{entries.map((item, index) => <div key={`${item.metric}-${item.period}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(120px,1fr)_minmax(0,2fr)]">
    <dt className="text-sm text-muted">{LABELS[item.metric] ?? item.metric.replaceAll("_", " ")}<span className="ml-2 text-xs">{item.period}</span></dt>
    <dd className="min-w-0"><p title={item.value} className="break-words text-sm font-bold tabular-nums">{compactFinancial(`${item.value} ${item.currency ?? ""} ${item.unit}`)}</p>
      <p className="mt-1 text-xs font-normal text-muted">{item.unit === "percent" ? "Percentage" : item.currency ? `${item.currency} · ${humanizeFigureMeta(item.unit)}` : `Currency unspecified · ${humanizeFigureMeta(item.unit)}`}</p>
      {item.snapshotId ? <Link href={`/financial-sources/${item.snapshotId}`} className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-accent-ink">View financial source →</Link> : sourceHref(item.sourceUrl) && new URL(item.sourceUrl).hostname !== "api.sectors.app" ? <a href={sourceHref(item.sourceUrl)!} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-8 items-center text-xs font-semibold text-accent-ink">View financial source ↗</a> : null}
    </dd></div>)}</dl>;
  return <Card className="min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">Financial context</h2><p className="mt-1 text-xs leading-relaxed text-muted">Annual reporting context, separate from this announcement.</p></div>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted"><span>Reporting period</span><Select label="Financial reporting period" value={period} onChange={setSelected} options={periods.map((value) => ({ value, label: value }))} /></div></div>
    <div className="mt-3">{renderRows(visible)}</div>
    {comparable && max > 0 ? <details className="mt-4 border-t border-divider pt-4"><summary className="cursor-pointer text-sm font-semibold">Annual revenue history</summary>
      <div className="mt-4 space-y-3">{revenueRows.map((item) => <div key={item.period} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 text-xs"><span className="text-muted">{item.period}</span><div><span className="block text-ink-2">{compactFinancial(`${item.value} ${item.currency} ${item.unit}`)}</span><span aria-hidden className="mt-1.5 block h-2 rounded-full bg-subtle"><span className="block h-2 rounded-full bg-accent" style={{ width: `${100 * Number(item.value) / max}%` }} /></span></div></div>)}</div>
    </details> : <p className="mt-3 rounded-field bg-subtle p-3 text-xs leading-relaxed text-muted">A revenue chart requires at least two periods with consistent currency, units, and reporting scope. Values remain as reported.</p>}
    {periods.length > 1 ? <details className="mt-4 border-t border-divider pt-4"><summary className="cursor-pointer text-sm font-semibold">All reporting periods · {rows.length} figures</summary><div className="mt-3">{renderRows([...rows].sort((a, b) => b.period.localeCompare(a.period)))}</div></details> : null}
  </Card>;
}
