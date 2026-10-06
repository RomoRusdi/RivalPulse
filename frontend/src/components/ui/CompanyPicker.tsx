"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { apiRequest } from "@/lib/http";
import { CompanySchema } from "@/lib/schemas";
import type { Company } from "@/lib/types";
import { cx } from "./primitives";

export function CompanyPicker({ value, onChange }: { value: Company | null; onChange: (company: Company | null) => void }) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Company[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiRequest(`/api/v1/auth/companies?query=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((payload) => { if (!controller.signal.aborted) { setRows(CompanySchema.array().parse((payload as { items: unknown }).items)); setLoading(false); setError(false); } })
        .catch(() => { if (!controller.signal.aborted) { setLoading(false); setError(true); setRows([]); } });
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, open, attempt]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const choose = (company: Company | null) => { onChange(company); setOpen(false); setQuery(""); };
  return <div ref={host} className="relative min-w-0">
    <label htmlFor={`${id}-input`} className="mb-1.5 block text-[13px] font-semibold text-ink-2">Workspace company</label>
    <div className="relative"><Search aria-hidden size={15} className="pointer-events-none absolute top-3.5 left-3.5 text-muted" />
      <input id={`${id}-input`} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        autoComplete="off" value={open ? query : value ? `${value.ticker} · ${value.name}` : "Neutral — compare competitors only"}
        onFocus={() => { setOpen(true); setLoading(true); setActive(0); }}
        onClick={() => { if (!open) { setOpen(true); setLoading(true); setActive(0); } }}
        onChange={(event) => { setQuery(event.target.value); setRows([]); setOpen(true); setLoading(true); setActive(0); }}
        onBlur={(event) => { if (!host.current?.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => Math.max(0, Math.min(rows.length, index + (event.key === "ArrowDown" ? 1 : -1)))); }
          if (event.key === "Enter" && open) { event.preventDefault(); choose(active === 0 ? null : rows[active - 1] ?? null); }
        }} className="min-h-11 w-full truncate rounded-field border border-border bg-subtle pr-9 pl-10 text-sm outline-none focus:border-accent focus:bg-card" />
      <ChevronDown aria-hidden size={14} className="pointer-events-none absolute top-3.5 right-3 text-muted" />
    </div>
    {open ? <div className="rp-modal absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-detail border border-border bg-card p-1.5 shadow-lg">
      <ul id={`${id}-list`} role="listbox" aria-label="Workspace company">
        {[null, ...rows].map((company, index) => <li id={`${id}-option-${index}`} key={company?.ticker ?? "neutral"} role="option" aria-selected={value?.ticker === company?.ticker}
          onPointerDown={(event) => { event.preventDefault(); choose(company); }} onPointerMove={() => setActive(index)}
          className={cx("flex cursor-pointer items-center justify-between gap-2 rounded-field px-3 py-2.5 text-sm", active === index && "bg-accent-wash")}>
          <span className="min-w-0"><span className="block font-semibold">{company ? `${company.ticker} · ${company.name}` : "Neutral"}</span><span className="mt-0.5 block text-xs text-muted">{company?.industry ?? "Compare competitors without a company perspective"}</span></span>
          {value?.ticker === company?.ticker ? <Check aria-hidden size={15} className="shrink-0 text-accent-ink" /> : null}
        </li>)}
      </ul>
      {loading ? <p role="status" className="p-3 text-xs text-muted">Searching the company catalog…</p> : error ? <button type="button" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }} className="min-h-11 p-3 text-xs font-semibold text-accent-ink">Catalog unavailable. Retry, or choose Neutral.</button> : !rows.length ? <p role="status" className="p-3 text-xs text-muted">No matching companies. Try a ticker or another name.</p> : null}
    </div> : null}
    <p className="mt-1.5 text-xs leading-relaxed text-muted">Choose your company for a relative perspective, or stay neutral. You can change this in Competitors.</p>
  </div>;
}
