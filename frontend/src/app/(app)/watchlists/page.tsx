"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  Disclaimer,
  Eyebrow,
  EmptyState,
  PageTitle,
  Pill,
  Skeleton,
  cx,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import {
  MAX_COMPANIES,
  MIN_COMPANIES,
  searchCatalogue,
} from "@/lib/catalogue";

export default function WatchlistsPage() {
  const {
    watchlist,
    signals,
    loading,
    addCompany,
    removeCompany,
    renameWatchlist,
    watchlistEdited,
    resetDemoState,
  } = useStore();

  const companies = watchlist?.companies ?? [];
  const atCapacity = companies.length >= MAX_COMPANIES;
  const belowMinimum = companies.length < MIN_COMPANIES;

  if (loading || !watchlist) return <WatchlistSkeleton />;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Competitors</PageTitle>
          <p className="mt-0.5 max-w-[68ch] text-sm text-muted">
            Manage a {MIN_COMPANIES}–{MAX_COMPANIES} company watchlist and open an evidence-backed battlecard for every monitored competitor.
          </p>
        </div>
        {watchlistEdited ? (
          <Button size="sm" onClick={resetDemoState}>
            Reset to default
          </Button>
        ) : null}
      </div>

      <Card className="min-w-0">
        <CardHeader
          title={
            <WatchlistName name={watchlist.name} onRename={renameWatchlist} />
          }
          aside={
            <Pill tone={belowMinimum ? "accent" : "neutral"}>
              {companies.length} of {MAX_COMPANIES}
            </Pill>
          }
        />

        {belowMinimum ? (
          <p className="mb-3 rounded-[9px] border border-accent-wash-border bg-accent-wash px-3 py-2 text-[13px] text-ink-2">
            Add at least {MIN_COMPANIES} competitors — comparison needs
            something to compare against.
          </p>
        ) : null}

        {companies.length === 0 ? (
          <EmptyState
            title="No competitors yet"
            body={`Add ${MIN_COMPANIES}–${MAX_COMPANIES} Indonesian public companies to monitor. Search by ticker, name or industry below.`}
          />
        ) : (
          <ul className="flex flex-col">
            {companies.map((company, i) => {
              const count = signals.filter(
                (s) => s.company === company.ticker,
              ).length;
              return (
                <li
                  key={company.ticker}
                  className={cx(
                    "flex flex-wrap items-center gap-3 py-3.5",
                    i < companies.length - 1 && "border-b border-divider",
                  )}
                >
                  <span className="w-[58px] shrink-0 text-sm font-extrabold">
                    {company.ticker}
                  </span>
                  <span className="min-w-0 flex-[1_1_220px]">
                    <span className="block text-[15px] font-bold leading-[1.35]">
                      {company.name}
                    </span>
                    <span className="mt-[3px] block text-[13px] text-muted">
                      {company.industry}
                    </span>
                  </span>
                  <span className="text-[13px] text-muted">
                    {count} signal{count === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="sm"
                    aria-label={`Remove ${company.ticker} from ${watchlist.name}`}
                    onClick={() => removeCompany(company.ticker)}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 border-t border-divider pt-4">
          <AddCompany
            onAdd={addCompany}
            disabled={atCapacity}
            existing={companies.map((c) => c.ticker)}
          />
          {atCapacity ? (
            <p className="mt-2 text-[13px] text-muted">
              At {MAX_COMPANIES} companies. Remove one to add another — a tight
              list is what keeps the feed quiet.
            </p>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.025em]">Competitor battlecards</h2>
          <p className="mt-0.5 text-[13px] text-muted">Live summaries assembled from each company&apos;s stored signals and financial context.</p>
        </div>
        <Button size="sm" onClick={() => window.print()}>Print briefings</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((company) => {
          const owned = signals.filter((signal) => signal.company === company.ticker);
          const latest = owned[0];
          const evidence = owned.reduce((total, signal) => total + signal.evidence.length, 0);
          const growth = latest?.financialContext.metrics.find((metric) => metric.label.toLowerCase().includes("growth"));
          return (
            <Card key={company.ticker} className="group min-w-0 transition-console hover:border-neutral-300">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-extrabold tracking-[-0.02em]">{company.ticker}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{company.name}</p>
                </div>
                <Pill tone={owned.some((signal) => signal.severity === "high") ? "accent" : "neutral"}>{owned.length} signal{owned.length === 1 ? "" : "s"}</Pill>
              </div>
              <div className="mt-4 rounded-detail bg-subtle p-3.5">
                <Eyebrow>Latest observed move</Eyebrow>
                <p className="mt-1.5 text-sm font-bold leading-[1.45]">{latest?.title ?? "No observed move yet"}</p>
                <p className="mt-2 line-clamp-3 text-[13px] leading-[1.5] text-muted">{latest?.financialContext.whyItMatters ?? "Complete an investigation to establish this competitor's evidence baseline."}</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
                <div><dt className="text-muted">Evidence items</dt><dd className="mt-0.5 font-extrabold">{evidence}</dd></div>
                <div><dt className="text-muted">Financial movement</dt><dd className="mt-0.5 font-extrabold text-accent-ink">{growth?.value ?? "Awaiting data"}</dd></div>
              </dl>
              {latest ? (
                <Link href={`/signals/${latest.id}`} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline transition-console group-hover:text-accent">
                  Open full battlecard <ArrowRight aria-hidden size={14} />
                </Link>
              ) : null}
            </Card>
          );
        })}
      </div>

      {watchlistEdited ? (
        <p className="text-[13px] text-muted">
          Watchlist changes are saved in this browser only, until the backend
          owns watchlists.
        </p>
      ) : null}

      <Disclaimer />
    </>
  );
}

/* ── Rename ────────────────────────────────────────────────────────────── */

function WatchlistName({
  name,
  onRename,
}: {
  name: string;
  onRename: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="cursor-pointer rounded-[6px] text-[17px] font-bold transition-console hover:text-accent"
        title="Rename watchlist"
      >
        {name}
      </button>
    );
  }

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label="Watchlist name"
      className="w-48 rounded-[9px] border border-border bg-subtle px-2 py-1 text-[17px] font-bold text-ink outline-none"
    />
  );
}

/* ── Add ───────────────────────────────────────────────────────────────── */

function AddCompany({
  onAdd,
  disabled,
  existing,
}: {
  onAdd: (company: ReturnType<typeof searchCatalogue>[number]) => void;
  disabled: boolean;
  existing: string[];
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () =>
      searchCatalogue(query).filter((c) => !existing.includes(c.ticker)),
    [query, existing],
  );

  const choose = (index: number) => {
    const company = results[index];
    if (!company) return;
    onAdd(company);
    setQuery("");
    setHighlighted(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
          Add a competitor
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="company-results"
          aria-autocomplete="list"
          aria-activedescendant={
            results[highlighted] ? `company-option-${highlighted}` : undefined
          }
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(highlighted);
            } else if (e.key === "Escape") {
              setQuery("");
            }
          }}
          placeholder="Search by ticker, name or industry…"
          className="w-full rounded-field border border-border bg-subtle px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted-strong disabled:opacity-60"
        />
      </label>

      {results.length > 0 ? (
        <ul
          id="company-results"
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-field border border-border bg-card p-1 shadow-frame"
        >
          {/* Focus stays in the input; aria-activedescendant points at these. */}
          {results.map((company, i) => (
            <li
              key={company.ticker}
              id={`company-option-${i}`}
              role="option"
              aria-selected={i === highlighted}
              aria-label={`${company.ticker}, ${company.name}, ${company.industry}`}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => choose(i)}
              className={cx(
                "flex w-full cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition-console",
                i === highlighted ? "bg-subtle" : "bg-transparent",
              )}
            >
              <span className="w-[52px] shrink-0 text-[13px] font-extrabold">
                {company.ticker}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {company.name}
                </span>
                <span className="block text-xs text-muted">
                  {company.industry}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WatchlistSkeleton() {
  return (
    <>
      <Skeleton className="h-8 w-48" />
      <Card className="min-w-0">
        <Skeleton className="mb-4 h-6 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="mb-3 h-12 w-full" />
        ))}
      </Card>
    </>
  );
}
