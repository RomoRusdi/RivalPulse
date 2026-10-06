"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, FileSearch } from "lucide-react";
import { Card, CardHeader, ErrorCard, Pill, Skeleton } from "@/components/ui/primitives";
import { getRevenue } from "@/lib/api";
import { useStore } from "@/lib/store";
import { dashboardTime, sourceHref } from "@/lib/format";
import { collectionMessage, financialFigureText, PERFORMANCE_LABELS, performancePeriod, percentageText } from "@/lib/financial-performance";
import { RevenueTrendGraph } from "./RevenueTrendGraph";

type Feed = Awaited<ReturnType<typeof getRevenue>>;
type Company = Feed["companies"][number];
type Rate = Company["performanceMetrics"][number];
type Figure = { value: string | null; currency: string | null; unit: string; period: string };

function latestAnnual(company: Company, metric: string): Figure | undefined {
  const figures = company.annualFigures.filter((figure) => figure.metric === metric);
  if (!figures.length && metric === "revenue") {
    const point = company.points.at(-1);
    return point ? { ...point, period: String(point.year) } : undefined;
  }
  const latest = [...figures].sort((a, b) => b.period.localeCompare(a.period))[0];
  if (!latest) return;
  const conflicts = figures.some((figure) => figure.period === latest.period &&
    (figure.value !== latest.value || figure.currency !== latest.currency || figure.unit !== latest.unit || figure.basis !== latest.basis));
  return { ...latest, value: conflicts ? null : latest.value };
}

function latestRate(company: Company, name: string) {
  return [...company.performanceMetrics].filter((metric) => metric.metric === name)
    .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""))[0];
}

function AnnualValue({ figure }: { figure?: Figure }) {
  return figure ? <div title={financialFigureText(figure)}>
    <p className="font-bold tabular-nums text-ink">{financialFigureText(figure)}</p>
    <p className="mt-1 text-xs text-muted">FY{figure.period}</p>
  </div> : <span className="text-xs text-muted">Not supplied</span>;
}

function RateValue({ metric }: { metric?: Rate }) {
  return metric ? <div>
    <p className="font-bold tabular-nums text-ink">{percentageText(metric.value, metric.metric !== "net_profit_margin")}</p>
    <p className="mt-1 text-xs text-muted">{performancePeriod(metric)}</p>
    <p className="mt-1 text-[11px] text-muted">Provider reported</p>
  </div> : <span className="text-xs text-muted">Not supplied</span>;
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
  const annualColumns = ["revenue", "earnings"].filter((name) => companies.some((company) => latestAnnual(company, name)));
  const rateColumns = Object.keys(PERFORMANCE_LABELS).filter((name) => companies.some((company) => latestRate(company, name)));
  const covered = companies.filter((company) => company.points.length || company.annualFigures.length || company.performanceMetrics.length).length;
  const unknownMoney = companies.some((company) => company.annualFigures.some((figure) => !figure.currency || /unspecified|unknown/i.test(figure.unit)) || company.points.some((point) => !point.currency || /unspecified|unknown/i.test(point.unit)));
  const mixedIndustries = feed.comparisonEligibility.reasons.includes("mixed_business_definitions");
  const comparable = feed.baseYear !== null || feed.absoluteAvailable;
  const companyLabel = (company: Company) => <>
    <p className="font-extrabold text-ink">{company.ticker}{watchlist?.user_company === company.ticker ? <span title="Your company" aria-label="Your company"> ★</span> : null}</p>
    <p className="mt-1 text-xs font-normal text-muted">{company.name}</p>
    {company.profile ? <p className="mt-1 text-[11px] font-normal text-muted">{company.profile.industry}</p> : null}
  </>;
  return <Card className="min-w-0">
    <CardHeader title="Competitor performance snapshot" aside={<Pill tone="quiet">{covered}/{companies.length} companies</Pill>} className="mb-2 flex flex-wrap items-center justify-between gap-3" />
    <p className="max-w-[84ch] text-sm leading-relaxed text-muted">Reported growth, profitability, and financial scale to support competitor research. Each figure keeps its own reporting period.</p>
    {covered === 0 ? <p className="mt-4 flex items-start gap-2 rounded-field bg-subtle p-4 text-sm text-muted"><FileSearch aria-hidden size={18} className="shrink-0" />Collect financial evidence through an investigation. Any stored company context is shown below.</p> : null}
    {unknownMoney || mixedIndustries ? <div className="mt-4 rounded-field bg-subtle px-4 py-3 text-xs leading-relaxed text-muted">
      {unknownMoney ? <p>Some figures use units as reported. Currency or reporting scale was not supplied, so monetary growth and ranking are withheld.</p> : null}
      {mixedIndustries ? <p className={unknownMoney ? "mt-1" : ""}>This watchlist spans different industries. Use these figures as company context; revenue definitions and margins may differ.</p> : null}
    </div> : null}
    <div className="mt-5 hidden overflow-x-auto rounded-field border border-divider lg:block">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Stored financial performance for each watched company, with individual periods and source links</caption>
        <thead className="bg-subtle/70 text-[11px] text-muted"><tr>
          <th scope="col" className="px-4 py-3 font-bold">Company</th>
          {annualColumns.map((name) => <th scope="col" key={name} className="px-4 py-3 font-bold">Latest annual {name}</th>)}
          {rateColumns.map((name) => <th scope="col" key={name} className="px-4 py-3 font-bold">{PERFORMANCE_LABELS[name]}</th>)}
          <th scope="col" className="px-4 py-3 font-bold">Evidence & research</th>
        </tr></thead>
        <tbody>{companies.map((company) => <tr key={company.ticker} className="border-t border-divider align-top">
          <th scope="row" className="min-w-40 max-w-56 px-4 py-4">{companyLabel(company)}</th>
          {annualColumns.map((name) => <td key={name} className="px-4 py-4"><AnnualValue figure={latestAnnual(company, name)} /></td>)}
          {rateColumns.map((name) => <td key={name} className="px-4 py-4"><RateValue metric={latestRate(company, name)} /></td>)}
          <td className="min-w-48 px-4 py-3"><Evidence company={company} /></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mt-5 grid gap-4 lg:hidden sm:grid-cols-2">{companies.map((company) => <article key={company.ticker} className="min-w-0 rounded-detail border border-divider p-4">
      <div>{companyLabel(company)}</div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4">
        {annualColumns.map((name) => <div key={name} className="min-w-0"><dt className="mb-1.5 text-[11px] font-semibold text-muted">Latest annual {name}</dt><dd className="break-words text-sm"><AnnualValue figure={latestAnnual(company, name)} /></dd></div>)}
        {rateColumns.map((name) => <div key={name} className="min-w-0"><dt className="mb-1.5 text-[11px] font-semibold text-muted">{PERFORMANCE_LABELS[name]}</dt><dd className="break-words text-sm"><RateValue metric={latestRate(company, name)} /></dd></div>)}
      </dl>
      <div className="mt-4 border-t border-divider pt-3"><Evidence company={company} /></div>
    </article>)}</div>
    {companies.filter((company) => /merger|scope change|acquisition/i.test(company.note)).map((company) => <p key={company.ticker} className="mt-3 text-xs leading-relaxed text-muted"><strong className="text-ink-2">{company.ticker}</strong> · {company.note}</p>)}
    {covered ? <p className="mt-4 text-xs leading-relaxed text-muted">Use financial performance to guide research into positioning, products, pricing, and partnerships. These figures alone do not establish a marketing cause or an organic growth rate.</p> : null}
    {companies.some((company) => company.points.length || company.annualFigures.length) ? <details className="mt-5 border-t border-divider pt-4">
      <summary className="min-h-8 cursor-pointer text-sm font-bold">Annual history and sources</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs">
        <caption className="sr-only">Reported annual revenue and earnings from saved evidence</caption>
        <thead><tr className="border-b border-border text-muted">{["Company / year", "Metric", "Reported value", "Source"].map((label) => <th scope="col" className="px-3 py-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{companies.flatMap((company) => (company.annualFigures.length ? company.annualFigures.filter((figure) => ["revenue", "earnings"].includes(figure.metric)) : company.points.map((point) => ({ ...point, metric: "revenue", period: String(point.year) })))
          .sort((a, b) => b.period.localeCompare(a.period)).map((figure, index) => <tr key={`${company.ticker}-${figure.metric}-${figure.period}-${index}`} className="border-b border-divider">
            <th scope="row" className="px-3 py-3">{company.ticker} · FY{figure.period}</th><td className="px-3 py-3 capitalize">{figure.metric}</td>
            <td className="px-3 py-3 tabular-nums" title={financialFigureText(figure)}>{financialFigureText(figure)}</td>
            <td className="px-3 py-3">{company.snapshotId ? <Link href={`/financial-sources/${company.snapshotId}`} className="inline-flex min-h-9 items-center font-bold text-accent-ink">View exact source</Link> : "Sample evidence"}</td>
          </tr>))}</tbody>
      </table></div>
    </details> : null}
    {companies.filter((company) => company.coverage === "profile_only" && company.profile?.website && sourceHref(company.profile.website.startsWith("http") ? company.profile.website : `https://${company.profile.website}`)).map((company) => <p key={company.ticker} className="mt-2 text-xs"><a href={company.profile!.website!.startsWith("http") ? company.profile!.website! : `https://${company.profile!.website}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center font-bold text-accent-ink">{company.ticker} · Company website ↗</a></p>)}
    {comparable ? <details className="mt-4 border-t border-divider pt-4"><summary className="min-h-8 cursor-pointer text-sm font-bold">Explore verified annual revenue</summary><div className="mt-4"><RevenueTrendGraph feed={feed} /></div></details> : null}
  </Card>;
}
