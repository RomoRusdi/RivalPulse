"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "./primitives";
import { useReversiblePresence } from "@/lib/motion";

type Option = { value: string; label: string; description?: string; disabled?: boolean };

/** A select-only combobox: focus stays on its trigger while arrows inspect options. */
export function Select({ value, onChange, options, label, disabled = false, className }: {
  value: string; onChange: (value: string) => void; options: Option[]; label: string;
  disabled?: boolean; className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const { open, present, setOpen } = useReversiblePresence();
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240, transformOrigin: "top center" });
  const selected = options.findIndex((option) => option.value === value);
  const locate = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const height = Math.min(280, options.length * 60 + 16);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const flip = below < Math.min(height, 180) && above > below;
    const maxHeight = Math.max(80, Math.min(height, flip ? above : below));
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.min(rect.width, window.innerWidth - 16), top: flip ? rect.top - maxHeight - 6 : rect.bottom + 6, maxHeight, transformOrigin: flip ? "bottom center" : "top center" });
  };
  const show = () => {
    if (!options.some((option) => !option.disabled)) return;
    locate(); setActive(selected >= 0 && !options[selected].disabled ? selected : options.findIndex((option) => !option.disabled)); setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value); setOpen(false); trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", locate);
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", locate); window.removeEventListener("scroll", scroll, true); };
    // Position only changes in response to user input or viewport resizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  const move = (direction: number) => {
    for (let step = 1; step <= options.length; step++) {
      const next = (active + step * direction + options.length) % options.length;
      if (!options[next].disabled) { setActive(next); return; }
    }
  };
  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-expanded={open}
      aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
      disabled={disabled} onClick={() => open ? setOpen(false) : show()} onBlur={(event) => { if (!menu.current?.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"].includes(event.key)) event.preventDefault();
        if (event.key === "Escape" || event.key === "Tab") { setOpen(false); return; }
        if (event.key === "Enter" || event.key === " ") { if (open) choose(active); else show(); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { if (!open) show(); else move(event.key === "ArrowDown" ? 1 : -1); return; }
        if (event.key === "Home" || event.key === "End") {
          if (!open) show();
          const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);
          if (enabled.length) setActive(event.key === "Home" ? enabled[0] : enabled[enabled.length - 1]);
          return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          if (!open) show();
          const now = Date.now(); search.current.text = now - search.current.time > 600 ? event.key : search.current.text + event.key;
          search.current.time = now;
          const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(search.current.text.toLowerCase()));
          if (match >= 0) setActive(match);
        }
      }} className={cx("flex min-h-11 w-full items-center justify-between gap-3 rounded-field border border-border bg-subtle px-3.5 py-2.5 text-left text-sm text-ink transition-console hover:bg-card focus-visible:border-accent disabled:opacity-50", className)}>
      <span className="min-w-0 truncate">{options[selected]?.label ?? "Select an option"}</span>
      <ChevronDown aria-hidden size={16} className={cx("shrink-0 text-muted transition-console", open && "rotate-180")} />
    </button>
    {present ? createPortal(<div ref={menu} id={id} role="listbox" aria-label={label} data-open={open} inert={!open} aria-hidden={!open} className="rp-popover rp-scrollbar fixed z-[80] overflow-y-auto overscroll-contain rounded-detail border border-border bg-card p-1.5 shadow-frame" style={position}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={value === option.value} aria-disabled={option.disabled || undefined}
        onPointerDown={(event) => { event.preventDefault(); choose(index); }} onPointerMove={() => { if (!option.disabled) setActive(index); }}
        className={cx("flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-field px-3 py-2.5 text-sm", active === index && "bg-accent-wash", option.disabled && "cursor-not-allowed opacity-45")}>
        <span className="min-w-0"><span className="block font-semibold">{option.label}</span>{option.description ? <span className="mt-0.5 block text-xs text-muted">{option.description}</span> : null}</span>
        {value === option.value ? <Check aria-hidden size={16} className="shrink-0 text-accent" /> : null}
      </div>)}
    </div>, document.body) : null}
  </>;
}
