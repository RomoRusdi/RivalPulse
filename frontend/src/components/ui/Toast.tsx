"use client";

import Link from "next/link";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Route } from "next";
import { cx } from "./primitives";

/**
 * Run completion has to reach the user wherever they are — the whole premise
 * is that a run is async and you can leave the page. Without this, a run that
 * finishes while you are reading a signal detail is silent.
 */

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "neutral" | "accent";
  action?: { label: string; href: Route };
}

interface ToastValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

const AUTO_DISMISS_MS = 7000;
/** Must match `.rp-toast-out` in globals.css. */
const EXIT_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exiting, setExiting] = useState<number[]>([]);

  // Mark as leaving, let the exit transition play, then unmount.
  const dismiss = useCallback((id: number) => {
    setExiting((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      setExiting((prev) => prev.filter((x) => x !== id));
    }, EXIT_MS);
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({ toasts, push, dismiss }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport exiting={exiting} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

function ToastViewport({ exiting }: { exiting: number[] }) {
  const ctx = useContext(ToastContext);
  if (!ctx || ctx.toasts.length === 0) return null;

  return (
    <div
      // Polite: a finished run is worth announcing, not worth interrupting.
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      {ctx.toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            "rp-toast pointer-events-auto w-full max-w-[380px] rounded-detail border p-4 shadow-frame",
            exiting.includes(toast.id) && "rp-toast-out",
            toast.tone === "accent"
              ? "border-accent-wash-border bg-accent-wash"
              : "border-border bg-card",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15px] font-bold leading-[1.35]">
              {toast.title}
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => ctx.dismiss(toast.id)}
              className="-m-1 cursor-pointer p-1 text-muted transition-console hover:text-ink"
            >
              <X aria-hidden size={16} strokeWidth={1.5} />
            </button>
          </div>
          {toast.body ? (
            <p className="mt-1 text-[13px] leading-[1.55] text-muted">
              {toast.body}
            </p>
          ) : null}
          {toast.action ? (
            <Link
              href={toast.action.href}
              onClick={() => ctx.dismiss(toast.id)}
              className="mt-3 inline-block text-[13px] font-semibold text-accent-ink no-underline transition-console hover:text-accent"
            >
              {toast.action.label} →
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
