"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, FileDown } from "lucide-react";
import { Suspense, use, useEffect, useState } from "react";
import { Button, Card, Disclaimer, ErrorCard, Skeleton } from "@/components/ui/primitives";
import { FinancialContext } from "@/components/signal/FinancialContext";
import { DecisionSupport } from "@/components/signal/DecisionSupport";
import { useStore } from "@/lib/store";
import { useOptionalAuth } from "@/lib/auth";
import { getSignal } from "@/lib/api";
import { findingDate, humanizeFigureMeta, evidenceHref, evidenceLabel } from "@/lib/format";
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
  const sources = [...new Map((signal.sources ?? []).filter((item) => evidenceHref(item.url)).map((item) => [item.url, item])).values()];
  const observationSources = sources.filter((item) => item.observationSupport !== false);
  const savedNews = (signal.sources ?? []).some((item) => item.source === "sectors_news" && item.observationSupport !== false);
  const exportSummary = () => {
    // A readable brief: labelled sections, plain-language category, readable
    // dates and links that work outside the app.
    const origin = window.location.origin;
    const when = (value?: string | null) => value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not recorded";
    const kind: Record<string, string> = { competitor_move: "Competitor move", unverified_context: "Context only (not a competitor move)",
      financial_context: "Financial context", third_party_commentary: "Analyst commentary" };
    const d = signal.decisionSupport;
    const block = (title: string, body: string | string[]) => [title.toUpperCase(), ...(Array.isArray(body) ? body : [body]), ""];
    const title = `RivalPulse finding · ${signal.company} (${signal.companyName})`;
    const text = [
      title, "=".repeat(Math.min(title.length, 72)), "",
      signal.headline, "",
      `Category:  ${signal.type} · ${kind[signal.findingScope ?? ""] ?? "Not recorded"}`,
      `Added:     ${when(signal.addedAt ?? signal.detectedAt)}`,
      ...(signal.publishedAt ? [`Published: ${when(signal.publishedAt)}`] : []),
      ...(signal.classificationNote ? ["", signal.classificationNote] : []), "",
      ...block("What happened", observations.length ? observations.map((item) => item.text) : [signal.headline]),
      ...(facts.length ? block("Related facts", facts.map((item) => `- ${item.text}`)) : []),
      ...(d ? [
        ...block(`Why it matters${d.perspective ? ` to ${d.perspective}` : ""}`, [d.why_it_matters,
          `(${d.origin === "ai" ? `AI inference, ${d.uncertainty} uncertainty` : "Rule-based assessment; no AI explanation was accepted"})`]),
        ...block("Possible implication", d.potential_implication ?? "Not enough evidence yet to say how this affects your company."),
        ...block("Recommended next step", d.recommended_next_step),
        ...(d.limitations.length ? block("What remains unknown", d.limitations.map((item) => `- ${item}`)) : []),
      ] : []),
      ...block("Sources", [`- This finding in RivalPulse: ${origin}/signals/${signal.id}`,
        ...sources.map((item) => { const href = evidenceHref(item.url) ?? item.url; return `- ${href.startsWith("/") ? origin + href : href}`; })]),
      `Exported from RivalPulse on ${when(new Date().toISOString())}.`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `RivalPulse-${signal.company}-finding.txt`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="flex w-full flex-col gap-5">
    {backLink}
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-extrabold text-ink-2">{signal.company} · {signal.companyName}</span><span className="rounded-full px-3 py-1 font-semibold" style={categoryStyle(signal.type)}>{signal.type}</span></div>
    <h1 className="max-w-[48ch] text-[clamp(23px,2.5vw,32px)] font-extrabold leading-[1.25] tracking-[-0.025em]">{signal.headline}</h1>
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span>Added {findingDate(signal.addedAt, auth?.profile.timezone, signal.detectedAt)}</span>{signal.publishedAt ? <span>Published {Number.isFinite(new Date(signal.publishedAt).getTime()) ? findingDate(signal.publishedAt, auth?.profile.timezone) : signal.publishedAt}</span> : <span>Publication date unavailable</span>}</div>
    {signal.classificationNote ? <p role="status" className="rounded-field border border-divider bg-subtle p-4 text-sm leading-relaxed text-ink-2">{signal.classificationRevised ? `Category/attribution corrected${signal.originalType ? ` from ${signal.originalType}` : ""}. ` : "Context only. "}{signal.classificationNote}</p> : null}
    {signal.classificationOrigin ? <p className="text-xs leading-relaxed text-muted">{signal.classificationOrigin === "ai" ? "AI-classified from cited source text · attribution is an evidence-linked assessment, not independent verification" : signal.classificationOrigin === "unverified" ? "Attribution unavailable · source coverage only, not a confirmed company action" : "Earlier rule-based classification · original research retained"}</p> : null}
    {signal.relevanceReview ? <p role="status" className="rounded-field border border-accent-wash-border bg-accent-wash p-4 text-sm leading-relaxed text-accent-ink">Company relevance needs review. This stored article may discuss several companies; its announcement has not been confirmed as a change by {signal.company}. Review the original source before using it.</p> : null}
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,.75fr)_minmax(0,1.65fr)]">
      <div className="order-2 min-w-0 space-y-5 xl:order-1">
      <Card><h2 className="text-lg font-bold">Sources</h2>{savedNews ? <p className="mt-3 text-sm leading-relaxed text-muted"><strong className="text-ink-2">Saved Sectors news quotation</strong><br />Publisher link unavailable. The quotation is news evidence, not a company financial statement.</p> : null}{sources.length ? <ul className="mt-3 divide-y divide-divider">{sources.map((item, index) => <li key={item.url} className="py-3"><a href={evidenceHref(item.url)!} target={item.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="flex min-h-8 items-center justify-between gap-3 text-sm font-semibold text-accent-ink"><span className="min-w-0 break-words">{item.source === "sectors_news" ? "Sectors company news" : item.source === "sectors" ? "Company financial context" : `Supporting source ${index + 1}`}</span><ExternalLink aria-hidden size={14} className="shrink-0" /></a><p className="mt-1 text-xs leading-relaxed text-muted">{item.observationSupport === false ? "Financial context only · does not substantiate the news quotation" : evidenceLabel(item.url)}</p></li>)}</ul> : !savedNews ? <p className="mt-3 text-sm text-muted">Source links are unavailable in this older record.</p> : null}</Card>
      {facts.length ? <details className="rounded-card border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-bold">Supporting facts · {facts.length}</summary>{facts.map((item, index) => <p key={index} className="mt-3 text-sm leading-relaxed text-ink-2">{humanizeFigureMeta(item.text)}</p>)}</details> : null}
      </div>
      <div className="order-1 min-w-0 space-y-5 xl:order-2">
        <Card><h2 className="text-lg font-bold">What was observed</h2>
          <div className="mt-4 space-y-4">{observations.flatMap((item, index) => item.text.split(/\n\s*\n/).filter(Boolean).map((paragraph, part) => <p key={`${index}-${part}`} className="whitespace-pre-line break-words text-[15px] leading-[1.85] text-ink">{paragraph}</p>))}</div>
          {!observations.length ? <p className="mt-3 text-sm text-muted">Review the supporting evidence for this finding.</p> : null}
          {savedNews ? <p className="mt-4 border-t border-divider pt-3 text-xs leading-relaxed text-muted">Source: saved Sectors news quotation. Verify the original announcement before treating reported guidance or commentary as an established company action.</p> : null}
          {observationSources.length ? <div className="mt-5 flex flex-wrap gap-2 border-t border-divider pt-4" aria-label="Observation evidence">{observationSources.map((source, index) => <a key={source.url} href={evidenceHref(source.url)!} target={source.url.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-field border border-accent-wash-border bg-accent-wash px-3 text-xs font-bold text-accent-ink hover:bg-subtle focus-visible:bg-subtle">Evidence {index + 1} · {evidenceLabel(source.url)}<ExternalLink size={13} aria-hidden /></a>)}</div> : null}
        </Card>
        <Card><DecisionSupport signal={signal} /></Card>
        <FinancialContext data={signal.financialContext} />
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4"><details className="max-w-full text-xs text-muted"><summary className="cursor-pointer font-semibold">Research record</summary><dl className="mt-3 space-y-2 break-all"><div><dt>Stored at</dt><dd>{signal.storedAt}</dd></div>{signal.comparedAgainstRunId ? <div><dt>Comparison</dt><dd>Compared with previous research</dd></div> : null}</dl></details>
      <div className="flex flex-wrap gap-2"><Button onClick={exportSummary}><FileDown aria-hidden size={14} className="mr-2" />Export finding</Button><Button variant="primary" onClick={() => {
        startRun(`Investigate ${signal.company} (${signal.companyName}) further, starting from this finding: ${signal.title}. Focus on ${signal.company}.`); router.push("/");
      }}>Investigate deeper</Button></div></div>
    <Disclaimer />
  </div>;
}
