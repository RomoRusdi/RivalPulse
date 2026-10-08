"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, FileSearch } from "lucide-react";
import { Card, CardHeader, ErrorCard, Pill, Skeleton } from "@/components/ui/primitives";
import { getRevenue } from "@/lib/api";
import { useStore } from "@/lib/store";
import { dashboardTime, sourceHref, toIDR } from "@/lib/format";
import { collectionMessage, PERFORMANCE_LABELS, performancePeriod, percentageText } from "@/lib/financial-performance";
import { RevenueTrendGraph } from "./RevenueTrendGraph";
import { FinancialValue } from "@/components/ui/FinancialValue";
import { Select } from "@/components/ui/Select";
import { sectorGroups } from "@/lib/sector-groups";

type Feed = Awaited<ReturnType<typeof getRevenue>>;
type Company = Feed["companies"][number];
type Rate = Company["performanceMetrics"][number];
type Figure = { value: string | null; currency: string | null; unit: string; period: string; alternatives?: Figure[] };

function latestAnnual(company: Company, metric: string, period = "latest"): Figure | undefined {
  const figures = company.annualFigures.filter((figure) => figure.metric === metric && (period === "latest" || figure.period === period));
  if (!figures.length && metric === "revenue") {
    const point = company.points.filter((point) => period === "latest" || String(point.year) === period).at(-1);
    return point ? { ...point, period: String(point.year) } : undefined;
  }
  const latest = [...figures].sort((a, b) => b.period.localeCompare(a.period))[0];
  if (!latest) return;
  const conflicts = figures.some((figure) => figure.period === latest.period &&
    (figure.value !== latest.value || figure.currency !== latest.currency || figure.unit !== latest.unit || figure.basis !== latest.basis));
  return { ...latest, value: conflicts ? null : latest.value, alternatives: conflicts ? figures.filter((figure) => figure.period === latest.period) : undefined };
}

function latestRate(company: Company, name: string, period = "latest") {
  return [...company.performanceMetrics].filter((metric) => metric.metric === name && (period === "latest" || metric.period === period))
    .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""))[0];
}

function AnnualValue({ figure, showPeriod = true }: { figure?: Figure; showPeriod?: boolean }) {
  return <FinancialValue amount={figure} showPeriod={showPeriod} />;
}

function RateValue({ metric, showPeriod = true }: { metric?: Rate; showPeriod?: boolean }) {
  return metric ? <div>
    <p className="font-bold tabular-nums text-ink">{percentageText(metric.value, metric.metric !== "net_profit_margin")}</p>
    {showPeriod ? <p className="mt-1 text-xs text-muted">{performancePeriod(metric)}</p> : null}
  </div> : <span className="text-xs text-muted">Not reported</span>;
}

function ResearchLink({ ticker }: { ticker: string }) {
  const prompt = `Review ${ticker}'s recent product, pricing, and partnership signals alongside its reported financial performance.`;
  return <Link href={{ pathname: "/", query: { prompt } }} className="inline-flex min-h-11 items-center gap-1 text-xs font-bold text-accent-ink">
    Investigate signals <ArrowUpRight aria-hidden size={14} />
  </Link>;
}

function Evidence({ company }: { company: Company }) {
  const hasFinancials = company.annualFigures.length > 0 || company.performanceMetrics.length > 0 || company.points.length > 0;
  return <div className="text-xs leading-relaxed">
    {company.snapshotId && hasFinancials ? <Link href={`/financial-sources/${company.snapshotId}`} className="inline-flex min-h-9 items-center gap-1 font-bold text-accent-ink">View financial data <ArrowUpRight aria-hidden size={13} /></Link> : <p className="text-muted">{company.coverage === "profile_only" ? "Company context collected; financial figures not supplied." : "No financial report collected yet."}</p>}
    {company.freshness.fetchedAt ? <p className="text-[11px] text-muted">{company.freshness.status === "historical" ? "Historical report" : "Retrieved"} · {dashboardTime(company.freshness.fetchedAt)}</p> : null}
    {company.collectionStatus.status === "failed" ? <p className="mt-2 text-muted">{collectionMessage(company.collectionStatus.code)}{hasFinancials ? " Saved figures remain visible." : ""}</p> : null}
    {company.collectionStatus.status === "missing_financial" ? <p className="mt-2 text-muted">Latest response did not supply annual financial statements.</p> : null}
    <ResearchLink ticker={company.ticker} />
  </div>;
}

export function CompetitorPerformanceSnapshot() {
  const { watchlist, aggregates, activeRun } = useStore();
  const [loaded, setLoaded] = useState<{ key: string; feed: Feed } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState("latest");
  const key = `${watchlist?.id}:${watchlist?.companies.map((company) => company.ticker).join(",")}:${aggregates?.lastRunAt}:${activeRun?.status}:${attempt}`;
  useEffect(() => {
    if (!watchlist) return;
    const controller = new AbortController();
    getRevenue(watchlist, controller.signal).then((feed) => {
      if (!controller.signal.aborted) { setLoaded({ key, feed }); setFailure(null); }
    }).catch((cause) => {
      if (!controller.signal.aborted) setFailure({ key, message: cause instanceof Error ? cause.message : "Financial reports could not be loaded." });
    });
    return () => controller.abort();
    // Membership and research updates determine when saved evidence is reloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failure?.key === key) return <ErrorCard message={failure.message} onRetry={() => setAttempt((count) => count + 1)} />;
  if (!loaded || loaded.key !== key) return <Card><Skeleton className="h-64 w-full" /></Card>;
  const feed = loaded.feed;
  const companies = feed.companies;
  const groups = sectorGroups(companies, (company) => watchlist?.companies.find((item) => item.ticker === company.ticker)?.industry || company.profile?.industry, (company) => company.ticker);
  const annualColumns = ["revenue", "earnings"].filter((name) => companies.some((company) => latestAnnual(company, name)));
  const rateColumns = ["net_profit_margin"].filter((name) => companies.some((company) => latestRate(company, name)));
  const quarterly = Object.keys(PERFORMANCE_LABELS).filter((name) => name !== "net_profit_margin" && companies.some((company) => latestRate(company, name)));
  const years = [...new Set(companies.flatMap((company) => [...company.annualFigures.map((figure) => figure.period), ...company.points.map((point) => String(point.year)), ...company.performanceMetrics.filter((metric) => metric.periodKind === "annual" && metric.period).map((metric) => metric.period!)]))].sort().reverse();
  const selectedPeriod = years.includes(period) ? period : "latest";
  const common = (year: string) => companies.every((company) => latestAnnual(company, "revenue", year));
  const rowPeriod = (company: Company) => {
    const periods = [...new Set([...annualColumns.map((metric) => latestAnnual(company, metric, selectedPeriod)?.period), ...rateColumns.map((metric) => latestRate(company, metric, selectedPeriod)?.period)].filter(Boolean))];
    return periods.length === 1 ? periods[0] : null;
  };
  const covered = companies.filter((company) => company.points.length || company.annualFigures.length || company.performanceMetrics.length).length;
  const unknownMoney = companies.some((company) => company.annualFigures.some((figure) => !figure.currency || /unspecified|unknown/i.test(figure.unit)) || company.points.some((point) => !point.currency || /unspecified|unknown/i.test(point.unit)));
  const mixedIndustries = groups.length > 1 || feed.comparisonEligibility.reasons.includes("mixed_business_definitions");
  const comparable = !mixedIndustries && (feed.baseYear !== null || feed.absoluteAvailable);
  const barCandidates = (year: string) => companies.flatMap((company) => {
    const point = company.points.find((point) => String(point.year) === year);
    const value = point && point.comparable && !point.limitation ? toIDR(point) : null;
    return !mixedIndustries && feed.absoluteAvailable && feed.comparisonEligibility.absoluteCompanies.includes(company.ticker) && value !== null && value >= 0
      ? [{ company, point: point!, value }] : [];
  });
  const barYear = selectedPeriod === "latest" ? years.find((year) => barCandidates(year).length >= 2) : selectedPeriod;
  const bars = barYear ? barCandidates(barYear) : [];
  const barMax = Math.max(1, ...bars.map((bar) => bar.value));
  const companyLabel = (company: Company) => <>
    <p className="font-extrabold text-ink">{company.ticker}{watchlist?.user_company === company.ticker ? <span title="Your company" aria-label="Your company"> ★</span> : null}</p>
    <p className="mt-1 text-xs font-normal text-muted">{company.name}</p>
    {company.profile ? <p className="mt-1 text-[11px] font-normal text-muted">{company.profile.industry}</p> : null}
  </>;
  return <Card className="min-w-0">
    <CardHeader title="Watchlist financial context" aside={<Pill tone="quiet">{covered}/{companies.length} companies</Pill>} className="mb-2 flex flex-wrap items-center justify-between gap-3" />
    <p className="max-w-[84ch] text-sm leading-relaxed text-muted">Reported growth, profitability, and financial scale to support competitor research. Each figure keeps its own reporting period.</p>
    {years.length ? <div className="mt-4 flex flex-wrap items-center gap-3"><Select label="Annual reporting year" className="w-56" value={selectedPeriod} onChange={setPeriod} options={[{ value: "latest", label: "Latest available per company" }, ...years.map((year) => ({ value: year, label: `FY${year}${common(year) ? " · all companies" : " · partial coverage"}` }))]} /><p className="text-xs text-muted">{selectedPeriod === "latest" ? "Dates may differ. Select a year to compare the same period." : `${companies.filter((company) => latestAnnual(company, "revenue", selectedPeriod)).length}/${companies.length} companies report revenue for FY${selectedPeriod}. Missing figures stay visible.`}</p></div> : null}
    {covered === 0 ? <p className="mt-4 flex items-start gap-2 rounded-field bg-subtle p-4 text-sm text-muted"><FileSearch aria-hidden size={18} className="shrink-0" />Collect financial evidence through an investigation. Any stored company context is shown below.</p> : null}
    {unknownMoney || mixedIndustries ? <div className="mt-4 rounded-field bg-subtle px-4 py-3 text-xs leading-relaxed text-muted">
      {unknownMoney ? <p>Some figures use units as reported. Currency or reporting scale was not supplied, so monetary growth and ranking are withheld.</p> : null}
      {mixedIndustries ? <p className={unknownMoney ? "mt-1" : ""}>Mixed-sector watchlist. Figures are grouped by sector as reported company context, not one peer comparison. Bank revenue and telecom revenue are different business measures; cross-sector rankings and shared scale charts are withheld.</p> : null}
    </div> : null}
    <div className="mt-5 hidden overflow-x-auto rounded-field border border-divider lg:block">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Stored financial performance for each watched company, with individual periods and source links</caption>
        <thead className="bg-subtle/70 text-[11px] text-muted"><tr>
          <th scope="col" className="px-4 py-3 font-bold">Company</th>
          {annualColumns.map((name) => <th scope="col" key={name} className="px-4 py-3 text-right font-bold">{name === "earnings" ? "Net profit" : "Revenue"}</th>)}
          {rateColumns.map((name) => <th scope="col" key={name} className="px-4 py-3 text-right font-bold">Net margin</th>)}
          <th scope="col" className="px-4 py-3 font-bold">Evidence & research</th>
        </tr></thead>
        {groups.map((group) => <tbody key={group.label}>
          {groups.length > 1 ? <tr className="border-t border-divider bg-subtle/50"><th scope="rowgroup" colSpan={2 + annualColumns.length + rateColumns.length} className="px-4 py-3 text-xs font-bold text-ink-2">{group.label} · reported context</th></tr> : null}
          {group.items.map((company) => <tr key={company.ticker} className="border-t border-divider align-top">
            <th scope="row" className="sticky left-0 z-10 min-w-40 max-w-56 bg-card px-4 py-4">{companyLabel(company)}{rowPeriod(company) ? <p className="mt-2 text-xs font-normal text-muted">FY{rowPeriod(company)}</p> : null}</th>
            {annualColumns.map((name) => <td key={name} className="min-w-40 px-4 py-4 text-right"><AnnualValue figure={latestAnnual(company, name, selectedPeriod)} showPeriod={!rowPeriod(company)} /></td>)}
            {rateColumns.map((name) => <td key={name} className="px-4 py-4 text-right"><RateValue metric={latestRate(company, name, selectedPeriod)} showPeriod={!rowPeriod(company)} /></td>)}
            <td className="min-w-48 px-4 py-3"><Evidence company={company} /></td>
          </tr>)}
        </tbody>)}
      </table>
    </div>
    <div className="mt-5 grid gap-4 lg:hidden sm:grid-cols-2">{companies.map((company) => <article key={company.ticker} className="min-w-0 rounded-detail border border-divider p-4">
      <div>{companyLabel(company)}</div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
        {annualColumns.map((name) => <div key={name} className="min-w-0"><dt className="mb-1.5 text-[11px] font-semibold text-muted">{name === "earnings" ? "Net profit" : "Revenue"}</dt><dd className="break-words text-sm"><AnnualValue figure={latestAnnual(company, name, selectedPeriod)} /></dd></div>)}
        {rateColumns.map((name) => <div key={name} className="min-w-0"><dt className="mb-1.5 text-[11px] font-semibold text-muted">Net margin</dt><dd className="break-words text-sm"><RateValue metric={latestRate(company, name, selectedPeriod)} /></dd></div>)}
      </dl>
      <div className="mt-4 border-t border-divider pt-3"><Evidence company={company} /></div>
    </article>)}</div>
    {bars.length >= 2 ? <details className="mt-5 border-t border-divider pt-4"><summary className="cursor-pointer text-sm font-bold">Compare revenue scale · FY{barYear}</summary><p className="mt-2 text-xs leading-relaxed text-muted">Revenue for the same annual period, with verified IDR and compatible reporting scope. Bars start at zero.</p><dl className="mt-4 space-y-4">{bars.map(({ company, point, value }) => <div key={company.ticker}><div className="flex flex-wrap items-start justify-between gap-2"><dt className="text-sm font-bold">{company.ticker}</dt><dd className="text-right"><FinancialValue amount={point} /></dd></div><div aria-hidden className="mt-2 h-3 overflow-hidden rounded bg-subtle"><div className="h-full origin-left rounded bg-accent" style={{ width: `${value / barMax * 100}%` }} /></div></div>)}</dl>{bars.length < companies.length ? <p className="mt-3 text-xs text-muted">Excluded from this comparison: {companies.filter((company) => !bars.some((bar) => bar.company.ticker === company.ticker)).map((company) => company.ticker).join(", ")}. Their period or reporting metadata is missing or incompatible.</p> : null}</details> : null}
    {quarterly.length ? <details className="mt-5 border-t border-divider pt-4"><summary className="cursor-pointer text-sm font-bold">Quarterly growth · reported rates</summary><p className="mt-2 text-xs leading-relaxed text-muted">These percentages were reported by Sectors; RivalPulse did not calculate them from the monetary amounts above. They compare a quarter with the same quarter a year earlier, not annual revenue growth. Missing currency/scale blocks our monetary calculations, but does not erase a separately reported percentage. An unspecified quarter cannot establish a current trend or ranking.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{companies.map((company) => <div key={company.ticker} className="rounded-field bg-subtle/60 p-3"><h3 className="text-sm font-bold">{company.ticker}</h3><dl className="mt-3 space-y-3">{quarterly.map((name) => <div key={name}><dt className="mb-1 text-xs text-muted">{PERFORMANCE_LABELS[name]}</dt><dd><RateValue metric={latestRate(company, name)} /></dd></div>)}</dl></div>)}</div></details> : null}
    {companies.filter((company) => /merger|scope change|acquisition/i.test(company.note)).map((company) => <p key={company.ticker} className="mt-3 text-xs leading-relaxed text-muted"><strong className="text-ink-2">{company.ticker}</strong> · {company.note}</p>)}
    {covered ? <p className="mt-4 text-xs leading-relaxed text-muted">Use financial performance to guide research into positioning, products, pricing, and partnerships. These figures alone do not establish a marketing cause or an organic growth rate.</p> : null}
    {companies.some((company) => company.points.length || company.annualFigures.length) ? <details className="mt-5 border-t border-divider pt-4">
      <summary className="min-h-8 cursor-pointer text-sm font-bold">Annual history</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs">
        <caption className="sr-only">Reported annual revenue and earnings from saved evidence</caption>
        <thead><tr className="border-b border-border text-muted">{["Company / year", "Metric", "Reported value", "Source"].map((label) => <th scope="col" className="px-3 py-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{companies.flatMap((company) => (company.annualFigures.length ? company.annualFigures.filter((figure) => ["revenue", "earnings"].includes(figure.metric)) : company.points.map((point) => ({ ...point, metric: "revenue", period: String(point.year) })))
          .sort((a, b) => b.period.localeCompare(a.period)).map((figure, index) => <tr key={`${company.ticker}-${figure.metric}-${figure.period}-${index}`} className="border-b border-divider">
            <th scope="row" className="px-3 py-3">{company.ticker} · FY{figure.period}</th><td className="px-3 py-3 capitalize">{figure.metric}</td>
            <td className="px-3 py-3 text-right tabular-nums"><FinancialValue amount={figure} /></td>
            <td className="px-3 py-3">{company.snapshotId ? <Link href={`/financial-sources/${company.snapshotId}`} className="inline-flex min-h-9 items-center font-bold text-accent-ink">Company financials</Link> : "Saved evidence"}</td>
          </tr>))}</tbody>
      </table></div>
    </details> : null}
    {companies.filter((company) => company.coverage === "profile_only" && company.profile?.website && sourceHref(company.profile.website.startsWith("http") ? company.profile.website : `https://${company.profile.website}`)).map((company) => <p key={company.ticker} className="mt-2 text-xs"><a href={company.profile!.website!.startsWith("http") ? company.profile!.website! : `https://${company.profile!.website}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center font-bold text-accent-ink">{company.ticker} · Company website ↗</a></p>)}
    {comparable ? <details className="mt-4 border-t border-divider pt-4"><summary className="min-h-8 cursor-pointer text-sm font-bold">Explore verified annual revenue</summary><div className="mt-4"><RevenueTrendGraph feed={feed} /></div></details> : null}
  </Card>;
}
