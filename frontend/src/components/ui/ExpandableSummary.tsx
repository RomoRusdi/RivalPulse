"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
export function ExpandableSummary({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="mt-3">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id} className="rp-press flex min-h-11 items-center gap-2 text-xs font-semibold text-accent-ink"><ChevronDown size={15} aria-hidden className="rp-chevron" style={{ transform: `rotate(${open ? 180 : 0}deg)` }} />{label}</button>
    <div id={id} className="rp-expand" data-open={open} inert={!open} aria-hidden={!open}><div className="min-h-0 overflow-hidden"><div className="space-y-2 pb-2 text-xs leading-relaxed text-muted">{children}</div></div></div>
  </div>;
}
