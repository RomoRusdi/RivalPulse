"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, FileDown } from "lucide-react";
import { Suspense, use, useEffect, useState } from "react";
import { Button, Card, Disclaimer, ErrorCard, Skeleton } from "@/components/ui/primitives";
import { FinancialContext } from "@/components/signal/FinancialContext";
import { useStore } from "@/lib/store";
import { useOptionalAuth } from "@/lib/auth";
import { getSignal } from "@/lib/api";
import { findingDate, humanizeFigureMeta, sourceHref } from "@/lib/format";
import { categoryStyle } from "@/lib/signal-categories";
import type { Signal } from "@/lib/types";

export default function SignalDetailPage(props: PageProps<"/signals/[id]">) {
  return <Suspense fallback={<Skeleton className="h-80 w-full" />}><FindingDetail {...props} /></Suspense>;
}
function FindingDetail({ params }: PageProps<"/signals/[id]">) {
  const { id } = use(params);
  const { signals, startRun, markSignalSeen } = useStore();
  const router = useRouter();
  const search = useSearchParams();
  const back = search.get("returnTo");
  const returnTo = back && /^\/signals(?:\?[^#]*)?$/.test(back) ? back : "/signals";
  const auth = useOptionalAuth();
  const fromStore = signals.find((item) => item.id === id);
  const [fetched, setFetched] = useState<Signal | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getSignal(id).then((item) => { if (!cancelled) { setFetched(item); setError(!item); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [id, attempt]);
  const signal = fetched ?? fromStore;
  useEffect(() => { if (signal?.id) markSignalSeen(signal.id); }, [signal?.id, markSignalSeen]);
  const backLink = <Link href={returnTo as Route} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-muted no-underline hover:text-accent-ink"><ArrowLeft aria-hidden size={15} />Back to findings</Link>;
  if (error && !signal) return <>{backLink}<ErrorCard message="This finding could not be loaded." onRetry={() => setAttempt((value) => value + 1)} /></>;
  if (!signal) return <>{backLink}<Skeleton className="h-80 w-full" /></>;
  const observations = signal.evidence.filter((item) => item.kind === "observed_signal");
  const facts = signal.evidence.filter((item) => item.kind === "fact" && !/^(revenue|earnings|total_assets|total_equity|ebitda|revenue_growth_percent) for \d{4}/i.test(item.text));
  const sources = [...new Map((signal.sources ?? []).filter((item) => sourceHref(item.url)).map((item) => [item.url, item])).values()];
  const exportSummary = () => {
    const text = [signal.headline, `${signal.company} · ${signal.type}`, `Added: ${signal.addedAt ?? signal.detectedAt}`,
      ...observations.map((item) => item.text), ...facts.map((item) => item.text), ...sources.map((item) => item.url)].join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `RivalPulse-${signal.company}-finding.txt`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5">
    {backLink}
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-extrabold text-ink-2">{signal.company} · {signal.companyName}</span><span className="rounded-full px-3 py-1 font-semibold" style={categoryStyle(signal.type)}>{signal.type}</span></div>
    <h1 className="max-w-[48ch] text-[clamp(23px,2.5vw,32px)] font-extrabold leading-[1.25] tracking-[-0.025em]">{signal.headline}</h1>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span>Added {findingDate(signal.addedAt, auth?.profile.timezone, signal.detectedAt)}</span>{signal.publishedAt ? <span>Published {Number.isFinite(new Date(signal.publishedAt).getTime()) ? findingDate(signal.publishedAt, auth?.profile.timezone) : signal.publishedAt}</span> : <span>Publication date unavailable</span>}</div>
    {signal.relevanceReview ? <p role="status" className="rounded-field border border-accent-wash-border bg-accent-wash p-4 text-sm leading-relaxed text-accent-ink">Company relevance needs review. This stored article may discuss several companies; its announcement has not been confirmed as a change by {signal.company}. Review the original source before using it.</p> : null}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-5"><Card><h2 className="text-lg font-bold">What was observed</h2>
        {observations.map((item, index) => <p key={index} className="mt-4 whitespace-pre-line text-sm leading-[1.8] text-ink-2">{item.text}</p>)}
        {!observations.length ? <p className="mt-3 text-sm text-muted">Review the supporting evidence for this finding.</p> : null}
      </Card>
      <Card><h2 className="text-lg font-bold">Sources</h2>{sources.length ? <ul className="mt-3 divide-y divide-divider">{sources.map((item, index) => <li key={item.url} className="py-3"><a href={sourceHref(item.url)!} target="_blank" rel="noopener noreferrer" className="flex min-h-8 items-center justify-between gap-3 text-sm font-semibold text-accent-ink"><span className="min-w-0 break-words">{item.source === "sectors_news" ? "Sectors company news" : item.source === "sectors" ? "Sectors financial report" : `Supporting source ${index + 1}`}</span><ExternalLink aria-hidden size={14} className="shrink-0" /></a><p className="mt-1 truncate text-xs text-muted">{new URL(item.url).hostname}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted">Source links are unavailable in this older record.</p>}</Card>
      {facts.length ? <details className="rounded-card border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-bold">Supporting facts · {facts.length}</summary>{facts.map((item, index) => <p key={index} className="mt-3 text-sm leading-relaxed text-ink-2">{humanizeFigureMeta(item.text)}</p>)}</details> : null}
      </div>
      <FinancialContext data={signal.financialContext} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4"><details className="max-w-full text-xs text-muted"><summary className="cursor-pointer font-semibold">Research record</summary><dl className="mt-3 space-y-2 break-all"><div><dt>Investigation</dt><dd>{signal.runId}</dd></div><div><dt>Stored at</dt><dd>{signal.storedAt}</dd></div>{signal.comparedAgainstRunId ? <div><dt>Compared with</dt><dd>{signal.comparedAgainstRunId}</dd></div> : null}</dl></details>
      <div className="flex flex-wrap gap-2"><Button onClick={exportSummary}><FileDown aria-hidden size={14} className="mr-2" />Export finding</Button><Button variant="primary" onClick={() => {
        startRun(`Investigate ${signal.company} (${signal.companyName}) further, starting from this finding: ${signal.title}. Focus on ${signal.company}.`); router.push("/");
      }}>Investigate deeper</Button></div></div>
    <Disclaimer />
  </div>;
}
