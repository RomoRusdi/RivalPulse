"use client";
import { Select } from "@/components/ui/Select";

import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, RotateCcw } from "lucide-react";
import { Card, Disclaimer, EmptyState, ErrorCard, PageTitle, Skeleton } from "@/components/ui/primitives";
import { useOptionalAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { getFindings } from "@/lib/api";
import { SIGNAL_CATEGORIES } from "@/lib/signal-categories";
import { dashboardTime } from "@/lib/format";
import { SignalRow } from "./SignalRow";
import { SignalMix } from "./SignalMix";
import { CompetitorMomentum } from "./CompetitorMomentum";

type Feed = Awaited<ReturnType<typeof getFindings>>;
const PERIODS = [{ id: "today", label: "Today" }, { id: "week", label: "Last 7 days" },
  { id: "month", label: "Last 30 days" }, { id: "all", label: "All time" }, { id: "custom", label: "Custom dates" }];
const FIELD = "min-h-11 w-full rounded-field border border-border bg-card px-3 text-sm text-ink outline-none focus:border-accent";

function DateRangeForm({ start, end, onApply }: { start: string; end: string; onApply: (from: string, through: string) => void }) {
  const [message, setMessage] = useState("");
  return <form onSubmit={(event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const from = String(fields.get("from"));
    const through = String(fields.get("through"));
    if (from > through) { setMessage("The end date must be on or after the start date."); return; }
    setMessage(""); onApply(from, through);
  }} className="mt-4 flex flex-wrap items-end gap-3 border-t border-divider pt-4">
    <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-2">From<input name="from" type="date" required defaultValue={start} className={FIELD} /></label>
    <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-2">Through<input name="through" type="date" required defaultValue={end} className={FIELD} /></label>
    <button type="submit" className="min-h-11 rounded-field bg-accent px-4 text-sm font-bold text-white hover:bg-accent-hover">Apply dates</button>
    {message ? <p role="alert" className="w-full text-sm text-accent-ink">{message}</p> : null}
  </form>;
}

export function FindingBrowser() {
  const router = useRouter();
  const search = useSearchParams();
  const searchKey = search.toString();
  const { watchlist, aggregates, activeRun } = useStore();
  const auth = useOptionalAuth();
  const zone = auth?.profile.timezone ?? "Asia/Jakarta";
  const [data, setData] = useState<Feed | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const period = PERIODS.some((entry) => entry.id === search.get("period")) ? search.get("period")! : "month";
  const category = SIGNAL_CATEGORIES.some((entry) => entry.label === search.get("category")) ? search.get("category")! : "";
  const company = search.get("company") ?? "";
  const start = search.get("start") ?? "";
  const end = search.get("end") ?? "";
  const customIncomplete = period === "custom" && (!start || !end || start > end);
  const paramsKey = new URLSearchParams({ period, timezone: zone, ...(category ? { category } : {}),
    ...(company ? { company } : {}), ...(period === "custom" ? { start, end } : {}) }).toString();

  const change = (key: string, value: string) => {
    const next = new URLSearchParams(searchKey);
    if (value) next.set(key, value); else next.delete(key);
    router.replace((`/signals${next.size ? `?${next}` : ""}`) as Route, { scroll: false });
  };
  useEffect(() => {
    if (customIncomplete) return;
    const controller = new AbortController();
    getFindings(new URLSearchParams(paramsKey), controller.signal).then((result) => {
      if (!controller.signal.aborted) { setData(result); setLoadedKey(paramsKey); setLoading(false); setError(null); }
    }).catch((cause) => {
      if (!controller.signal.aborted) { setData(null); setLoadedKey(paramsKey); setLoading(false); setError(cause instanceof Error ? cause.message : "Findings could not be loaded."); }
    });
    return () => controller.abort();
  }, [paramsKey, customIncomplete, attempt, watchlist?.id, aggregates?.lastRunAt, activeRun?.status]);

  const update = (key: string, value: string) => { setLoading(true); setError(null); change(key, value); };
  const loadMore = async () => {
    if (!data?.nextCursor || paging) return;
    setPaging(true);
    const params = new URLSearchParams(paramsKey); params.set("cursor", data.nextCursor);
    try {
      const more = await getFindings(params);
      // Ignore responses from a previous filter selection.
      if (window.location.search.slice(1) === searchKey) setData((current) => current ? {
        ...more, items: [...current.items, ...more.items.filter((item) => !current.items.some((old) => old.id === item.id))],
      } : more);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "More findings could not be loaded."); }
    finally { setPaging(false); }
  };
  const returnTo = `/signals${searchKey ? `?${searchKey}` : ""}`;
  const pending = loading || loadedKey !== paramsKey;
  const shown = loadedKey === paramsKey ? data : null;

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><PageTitle>What changed</PageTitle><p className="mt-1 text-sm text-muted">Findings with evidence from your competitor watchlist.</p>
        <p className="mt-2 text-xs text-muted">{watchlist?.name ?? "Your workspace"} · Last investigation {aggregates ? dashboardTime(aggregates.lastRunAt) : "loading…"}</p></div>
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-field bg-accent px-4 text-sm font-bold text-white no-underline hover:bg-accent-hover">Open research <ArrowRight aria-hidden size={15} /></Link>
    </div>
    <Card className="min-w-0">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <label className="flex min-w-0 flex-col gap-2 text-xs font-bold text-ink-2">Date added
          <Select label="Date added" value={period} onChange={(value) => update("period", value)} options={PERIODS.map((entry) => ({ value: entry.id, label: entry.label }))} /></label>
        <label className="flex min-w-0 flex-col gap-2 text-xs font-bold text-ink-2">Category
          <Select label="Signal category" value={category} onChange={(value) => update("category", value)} options={[{ value: "", label: "All categories" }, ...SIGNAL_CATEGORIES.map((entry) => ({ value: entry.label, label: entry.label }))]} /></label>
        <label className="flex min-w-0 flex-col gap-2 text-xs font-bold text-ink-2">Company
          <Select label="Competitor filter" value={company} onChange={(value) => update("company", value)} options={[{ value: "", label: "All competitors" }, ...(watchlist?.companies.map((entry) => ({ value: entry.ticker, label: entry.ticker, description: entry.name })) ?? [])]} /></label>
        <div className="flex items-end"><button onClick={() => { setLoading(true); setAttempt((value) => value + 1); router.replace("/signals", { scroll: false }); }} className="inline-flex min-h-11 items-center gap-2 rounded-field px-3 text-sm font-semibold text-muted hover:bg-subtle"><RotateCcw aria-hidden size={14} />Reset filters</button></div>
      </div>
      {period === "custom" ? <DateRangeForm key={`${start}-${end}`} start={start} end={end} onApply={(from, through) => {
        const next = new URLSearchParams(searchKey); next.set("start", from); next.set("end", through);
        setLoading(true); setError(null); setAttempt((value) => value + 1); router.replace(`/signals?${next}` as Route, { scroll: false });
      }} /> : null}
      {customIncomplete ? <p role="status" className="mt-3 text-sm text-muted">Choose both dates, then select Apply dates.</p> : null}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><CalendarDays aria-hidden size={13} />First added to your workspace · {zone}. Publication dates appear in the finding.</p>
    </Card>
    {error ? <ErrorCard message={error} onRetry={() => { setLoading(true); setAttempt((value) => value + 1); }} /> : null}
    {!customIncomplete && (!error || shown) ? <>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
      <Card className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{category || "All findings"}</h2><p role="status" className="text-xs text-muted">{pending ? "Loading findings…" : `${shown?.summary.filtered ?? 0} matching findings · newest first`}</p></div>
        {pending ? <div aria-label="Loading findings" className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div> : shown?.items.length ? <div>{shown.items.map((item, index) => <SignalRow key={item.id} signal={{ ...item, seen: false }} last={index === shown.items.length - 1} returnTo={returnTo} />)}</div> : !error ? <EmptyState title="No findings in this selection" body="Change the date or category filters, or start an investigation to collect evidence." /> : null}
        {!pending && shown?.nextCursor ? <div className="mt-4 border-t border-divider pt-4 text-center"><button disabled={paging} onClick={loadMore} className="min-h-11 rounded-field border border-border px-5 text-sm font-bold hover:bg-subtle disabled:opacity-60">{paging ? "Loading…" : "Load more findings"}</button></div> : null}
      </Card>
      <div className="min-w-0 space-y-4">
        <SignalMix mix={shown?.summary.mix} total={shown?.summary.total} busy={pending} category={category} onSelect={(value) => update("category", category === value ? "" : value)} />
        <Card className="grid grid-cols-2 gap-4"><div><p className="text-xs font-semibold text-muted">Findings in date range</p><p className="mt-2 text-3xl font-extrabold tabular-nums">{pending ? "—" : shown?.summary.total ?? "—"}</p></div><div className="border-l border-divider pl-4"><p className="text-xs font-semibold text-muted">Companies represented</p><p className="mt-2 text-3xl font-extrabold tabular-nums">{pending ? "—" : shown?.summary.companies ?? "—"}</p></div></Card>
      </div>
      </div>
    </> : null}
    <details className="rounded-card border border-border bg-card p-5"><summary className="cursor-pointer text-sm font-bold text-ink-2">Financial context <span className="ml-1 font-normal text-muted">· annual reporting, separate from recent findings</span></summary><div className="mt-4"><CompetitorMomentum /></div></details>
    <Disclaimer />
  </>;
}
