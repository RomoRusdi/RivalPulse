"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { apiRequest, DEMO_MODE } from "@/lib/http";
import { COMPANY_CATALOGUE, searchCatalogue } from "@/lib/catalogue";
import { CompanySchema } from "@/lib/schemas";
import type { Company } from "@/lib/types";
import { cx } from "./primitives";
import { useReversiblePresence } from "@/lib/motion";

export function CompanyPicker({ value, onChange, label = "Workspace company", description = "Choose your company for a relative perspective, or stay neutral. You can change this in Competitors." }: {
  value: Company | string | null;
  onChange: (company: Company | null) => void;
  label?: string;
  description?: string;
}) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { open, present, setOpen } = useReversiblePresence();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Company[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ticker = typeof value === "string" ? value : value?.ticker;
  const selected = typeof value === "string" ? rows.find((company) => company.ticker === value) : value;
  const [position, setPosition] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number; transformOrigin: string }>({ left: 0, width: 0, top: 0, maxHeight: 256, transformOrigin: "top center" });
  const locate = () => {
    const rect = input.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const flip = below < 180 && above > below;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.min(rect.width, window.innerWidth - 16), top: flip ? undefined : rect.bottom + 6,
      bottom: flip ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.max(80, Math.min(256, flip ? above : below)), transformOrigin: flip ? "bottom center" : "top center" });
  };
  const show = () => { locate(); setQuery(""); setRows([]); setLoading(true); setError(false); setActive(0); setOpen(true); };
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      // This is catalogue discovery only, never a billable provider request.
      const request = DEMO_MODE
        ? Promise.resolve({ items: query.trim() ? searchCatalogue(query, 50) : COMPANY_CATALOGUE })
        : apiRequest(`/api/v1/auth/companies?query=${encodeURIComponent(query)}`, { signal: controller.signal });
      request
        .then((payload) => { if (!controller.signal.aborted) { setRows(CompanySchema.array().parse((payload as { items: unknown }).items)); setLoading(false); setError(false); } })
        .catch(() => { if (!controller.signal.aborted) { setLoading(false); setError(true); setRows([]); } });
    }, 200);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, open, attempt]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [setOpen]);
  useEffect(() => {
    if (!open) return;
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) locate(); };
    window.addEventListener("resize", locate);
    window.addEventListener("scroll", scroll, true);
    return () => { window.removeEventListener("resize", locate); window.removeEventListener("scroll", scroll, true); };
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id, rows]);
  const choose = (company: Company | null) => { onChange(company); setOpen(false); setQuery(""); };
  return <div ref={host} className="relative min-w-0">
    <label htmlFor={`${id}-input`} className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</label>
    <div className="rp-field-focus relative"><Search aria-hidden size={15} className="pointer-events-none absolute top-3.5 left-3.5 text-muted" />
      <input ref={input} id={`${id}-input`} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={open ? `${id}-list` : undefined} aria-describedby={`${id}-hint`} aria-activedescendant={open && (active === 0 || rows[active - 1]) ? `${id}-option-${active}` : undefined}
        autoComplete="off" placeholder="Search by ticker, name or industry…" value={open ? query : selected ? `${selected.ticker} · ${selected.name}` : ticker ?? "Neutral — compare competitors only"}
        onFocus={show}
        onClick={() => { if (!open) show(); }}
        onChange={(event) => { setQuery(event.target.value); setRows([]); setOpen(true); setLoading(true); setError(false); setActive(event.target.value.trim() ? 1 : 0); }}
        onBlur={(event) => { if (!host.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (!open) show(); else setActive((index) => Math.max(0, Math.min(rows.length, index + (event.key === "ArrowDown" ? 1 : -1)))); }
          if (event.key === "Enter") {
            event.preventDefault();
            if (!open) show();
            else if (active === 0) choose(null);
            else if (!loading && rows[active - 1]) choose(rows[active - 1]);
          }
        }} className="min-h-11 w-full truncate rounded-field border border-border bg-subtle pr-9 pl-10 text-sm outline-none focus:border-accent focus:bg-card" />
      <ChevronDown aria-hidden size={14} className="pointer-events-none absolute top-3.5 right-3 text-muted" />
    </div>
    {present ? createPortal(<div ref={menu} data-open={open} inert={!open} aria-hidden={!open} style={position} className="rp-popover rp-scrollbar fixed z-[80] overflow-y-auto overscroll-contain rounded-detail border border-border bg-card p-2 shadow-lg">
      <ul id={`${id}-list`} role="listbox" aria-label={label}>
        {[null, ...rows].map((company, index) => <li id={`${id}-option-${index}`} key={company?.ticker ?? "neutral"} role="option" aria-selected={(ticker ?? null) === (company?.ticker ?? null)}
          onPointerDown={(event) => { event.preventDefault(); choose(company); }} onPointerMove={() => setActive(index)}
          className={cx("flex cursor-pointer items-center justify-between gap-2 rounded-field px-3 py-2.5 text-sm", active === index && "bg-accent-wash")}>
          <span className="min-w-0"><span className="block font-semibold">{company ? `${company.ticker} · ${company.name}` : "Neutral"}</span><span className="mt-0.5 block text-xs text-muted">{company?.industry ?? "Compare competitors without a company perspective"}</span></span>
          {(ticker ?? null) === (company?.ticker ?? null) ? <Check aria-hidden size={15} className="shrink-0 text-accent-ink" /> : null}
        </li>)}
      </ul>
      {loading ? <p role="status" className="p-3 text-xs text-muted">Searching the company catalog…</p> : error ? <button type="button" onClick={() => { setLoading(true); setAttempt((value) => value + 1); }} className="min-h-11 p-3 text-xs font-semibold text-accent-ink">Catalog unavailable. Retry, or choose Neutral.</button> : !rows.length ? <p role="status" className="p-3 text-xs text-muted">No matching companies. Try a ticker or another name.</p> : null}
    </div>, document.body) : null}
    <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p>
  </div>;
}
