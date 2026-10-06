"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { categoryStyle } from "@/lib/signal-categories";
import { useOptionalAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { findingDate } from "@/lib/format";
import type { SignalWithState } from "@/lib/types";

export function SignalRow({ signal, last = false, returnTo }: { signal: SignalWithState; last?: boolean; returnTo?: string }) {
  const { markSignalSeen, justRevealedIds } = useStore();
  const auth = useOptionalAuth();
  return <Link href={(`/signals/${signal.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`) as Route}
    onClick={() => markSignalSeen(signal.id)}
    className={cx("group flex min-w-0 items-start gap-3 rounded-field px-2 py-5 no-underline transition-console hover:bg-subtle", !last && "border-b border-divider", justRevealedIds.includes(signal.id) && "rp-row-new")}>
    <span className="min-w-0 flex-1">
      <span className="mb-2.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-extrabold tracking-wide text-ink-2">{signal.company}</span>
        <span className="rounded-full px-2.5 py-1 font-semibold" style={categoryStyle(signal.type)}>{signal.type}</span>
        <span className="text-muted">Added {findingDate(signal.addedAt, auth?.profile.timezone, signal.detectedAt)}</span>
        {signal.relevanceReview ? <span className="font-semibold text-accent-ink">Company relevance needs review</span> : null}
      </span>
      <span className="block break-words text-[15px] font-bold leading-relaxed text-ink">{signal.title}</span>
      <span className="mt-1.5 block text-xs leading-relaxed text-muted">{signal.companyName} · View supporting evidence</span>
    </span>
    <ChevronRight aria-hidden size={17} className="mt-7 shrink-0 text-muted transition-console group-hover:text-accent-ink" />
  </Link>;
}
