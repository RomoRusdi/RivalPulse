"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { clock } from "@/lib/format";

/**
 * Global background-run indicator. The store owns the live run, so it keeps
 * streaming while the user is on another route — this pill is how they know.
 * Hidden on the agent tab itself, which already shows full progress.
 */
export function RunIndicator() {
  const pathname = usePathname();
  const { activeRun } = useStore();
  const busy =
    activeRun?.status === "queued" || activeRun?.status === "running";
  if (!busy || pathname === "/") return null;

  const label =
    activeRun.status === "queued"
      ? "Investigation queued"
      : "Investigating";

  return (
    <Link
      href="/"
      aria-label={`${label} — back to the agent chat`}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-accent-wash-border bg-accent-wash px-2.5 py-1.5 text-xs font-bold text-accent-ink no-underline transition-console hover:bg-accent hover:text-white"
    >
      <LoaderCircle aria-hidden size={13} className="shrink-0 animate-spin" />
      <span className="hidden sm:inline">{label}</span>
      <span aria-live="polite" className="tabular-nums">
        {clock(activeRun.elapsedSeconds)}
      </span>
    </Link>
  );
}
