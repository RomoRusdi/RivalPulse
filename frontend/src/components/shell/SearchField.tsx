"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Route } from "next";
import { SeverityPill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { RUN_HISTORY } from "@/lib/mock-data";
import { shortDate } from "@/lib/format";

interface Result {
  id: string;
  group: "Signals" | "Companies" | "Runs";
  title: string;
  meta: string;
  href: Route;
  /** Rendered on the right of a signal result. */
  severity?: "high" | "medium" | "low";
  date?: string;
}

const MAX_PER_GROUP = 4;

/**
 * Top-bar search across signals, watchlist companies and past runs.
 *
 * Everything it searches is already in memory, so this stays client-side. When
 * the corpus outgrows that, swap `results` for a debounced `GET /search`.
 */
export function SearchField() {
  const { signals, watchlist } = useStore();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matched: Result[] = [];

    for (const s of signals) {
      if (
        s.title.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.companyName.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.subline.toLowerCase().includes(q)
      ) {
        matched.push({
          id: s.id,
          group: "Signals",
          title: s.title,
          meta: `${s.company} · ${s.type}`,
          href: `/signals/${s.id}` as Route,
          severity: s.severity,
          date: shortDate(s.detectedAt),
        });
      }
    }

    for (const c of watchlist?.companies ?? []) {
      if (
        c.ticker.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q)
      ) {
        const count = signals.filter((s) => s.company === c.ticker).length;
        matched.push({
          id: c.ticker,
          group: "Companies",
          title: `${c.ticker} · ${c.name}`,
          meta: `${c.industry} · ${count} signal${count === 1 ? "" : "s"}`,
          href: "/watchlists",
        });
      }
    }

    for (const r of RUN_HISTORY) {
      if (r.query.toLowerCase().includes(q) || r.id.includes(q)) {
        matched.push({
          id: r.id,
          group: "Runs",
          title: r.query,
          meta: `Run #${r.id} · ${r.at}`,
          href: "/runs",
        });
      }
    }

    // Cap each group so one noisy category can't crowd the others out.
    const capped: Result[] = [];
    for (const group of ["Signals", "Companies", "Runs"] as const) {
      capped.push(
        ...matched.filter((m) => m.group === group).slice(0, MAX_PER_GROUP),
      );
    }
    return capped;
  }, [query, signals, watchlist]);

  // Ctrl/Cmd+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const go = (index: number) => {
    const result = results[index];
    if (!result) return;
    setOpen(false);
    setQuery("");
    router.push(result.href);
  };

  const showDropdown = open && query.trim().length > 0;

  return (
    <div
      ref={containerRef}
      // Grows with the header but stops before it becomes an absurdly wide
      // field on a large monitor.
      className="relative min-w-0 flex-1 basis-60 md:max-w-[560px]"
    >
      <div className="flex items-center gap-2.5 rounded-field border border-border bg-subtle px-3.5 py-[9px]">
        <Search
          aria-hidden
          size={16}
          strokeWidth={1.5}
          className="shrink-0 text-muted"
        />
        <span className="sr-only" id="search-hint">
          Search companies, signals or runs. Press Control or Command K to focus.
        </span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-describedby="search-hint"
          aria-activedescendant={
            showDropdown && results[highlighted]
              ? `search-option-${highlighted}`
              : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(highlighted);
            } else if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search companies, signals or runs…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-strong"
        />
        <kbd className="hidden shrink-0 rounded-[6px] border border-border bg-card px-1.5 py-0.5 text-[11px] font-semibold text-muted sm:block">
          ⌘K
        </kbd>
      </div>

      {showDropdown ? (
        <div
          id="search-results"
          role="listbox"
          className="absolute z-40 mt-1.5 max-h-[60vh] w-full overflow-y-auto rounded-field border border-border bg-card p-1 shadow-frame"
        >
          {results.length === 0 ? (
            <p className="px-2.5 py-3 text-[13px] text-muted">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            results.map((result, i) => {
              const first =
                i === 0 || results[i - 1].group !== result.group;
              return (
                <div key={`${result.group}-${result.id}`} role="presentation">
                  {first ? (
                    <p
                      aria-hidden
                      className="px-2.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-muted"
                    >
                      {result.group}
                    </p>
                  ) : null}
                  {/* Focus stays in the input; aria-activedescendant points here. */}
                  <div
                    id={`search-option-${i}`}
                    role="option"
                    aria-selected={i === highlighted}
                    aria-label={`${result.group}: ${result.title}. ${result.meta}`}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => go(i)}
                    className={cx(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition-console",
                      i === highlighted ? "bg-subtle" : "bg-transparent",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {result.title}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {result.meta}
                      </span>
                    </span>
                    {result.severity ? (
                      <SeverityPill severity={result.severity} />
                    ) : null}
                    {result.date ? (
                      <span className="shrink-0 text-[13px] text-muted">
                        {result.date}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
