"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, History, Plus } from "lucide-react";

export function AgentControls({ blocked, onNew, onHistory }: { blocked: boolean; onNew: () => void; onHistory: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="relative shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setOpen(true); } }} className="inline-flex min-h-11 items-center gap-2 rounded-field border border-border bg-card px-3 text-xs font-bold text-accent-ink transition-console hover:bg-accent-wash">Chat controls <ChevronDown size={14} aria-hidden /></button>
    {open ? <div ref={menu} id={id} role="menu" aria-label="Chat controls" className="rp-select-menu absolute right-0 top-full z-30 mt-2 w-48 rounded-detail border border-border bg-card p-1.5 shadow-frame">
      <button type="button" role="menuitem" disabled={blocked} onClick={() => { close(); onNew(); }} className="flex min-h-11 w-full items-center gap-2 rounded-field px-3 text-left text-sm font-semibold hover:bg-subtle focus-visible:bg-subtle disabled:cursor-not-allowed disabled:opacity-45"><Plus size={15} aria-hidden />New chat</button>
      <button type="button" role="menuitem" onClick={() => { close(); onHistory(); }} className="flex min-h-11 w-full items-center gap-2 rounded-field px-3 text-left text-sm font-semibold hover:bg-subtle focus-visible:bg-subtle"><History size={15} aria-hidden />History</button>
    </div> : null}
  </div>;
}
