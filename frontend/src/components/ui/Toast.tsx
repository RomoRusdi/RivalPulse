"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { cx } from "./primitives";

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "neutral" | "accent" | "warning" | "error";
  action?: { label: string; href: Route } | { label: string; onClick: () => void };
}

interface ToastValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { ...toast, id }].slice(-3));
  }, []);
  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
        {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.tone === "error" || toast.tone === "warning" ? 12000 : 8000);
    return () => clearTimeout(timer);
  }, [dismiss, paused, toast.id, toast.tone]);
  const Icon = toast.tone === "accent" ? CheckCircle2 : toast.tone === "neutral" ? Info : CircleAlert;
  const actionClass = "mt-3 inline-flex min-h-8 items-center text-[13px] font-bold text-accent-ink no-underline transition-console hover:text-accent";
  const activate = () => {
    if (toast.action && "onClick" in toast.action) toast.action.onClick();
    dismiss(toast.id);
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
      className={cx("rp-toast pointer-events-auto w-full max-w-[400px] rounded-detail border bg-card p-4 shadow-frame", toast.tone === "error" ? "border-red-200" : toast.tone === "warning" ? "border-accent-wash-border" : "border-border")}
    >
      <div className="flex items-start gap-3">
        <Icon aria-hidden size={19} className={cx("mt-0.5 shrink-0", toast.tone === "error" ? "text-red-700" : toast.tone === "neutral" ? "text-muted" : "text-accent-ink")} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug">{toast.title}</p>
          {toast.body ? <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{toast.body}</p> : null}
          {toast.action ? "href" in toast.action ? <Link href={toast.action.href} onClick={() => dismiss(toast.id)} className={actionClass}>{toast.action.label} →</Link> : <button type="button" onClick={activate} className={cx(actionClass, "cursor-pointer")}>{toast.action.label} →</button> : null}
        </div>
        <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted transition-console hover:bg-subtle hover:text-ink"><X aria-hidden size={16} /></button>
      </div>
    </div>
  );
}
