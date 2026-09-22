"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SeverityPill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { shortDate } from "@/lib/format";
import type { SignalWithState } from "@/lib/types";

/**
 * One signal row. Shared by the dashboard card and the full Signals list, so
 * the two stay identical as the design intends.
 *
 * The unread marker sits in its own left-hand gutter, the way every inbox
 * does it — inline after the title it read as decoration with no legend.
 */
export function SignalRow({
  signal,
  last = false,
}: {
  signal: SignalWithState;
  last?: boolean;
}) {
  const { markSignalSeen, justRevealedIds } = useStore();
  // Only rows a run surfaced live animate in; the list never does on load.
  const justArrived = justRevealedIds.includes(signal.id);

  return (
    <Link
      href={`/signals/${signal.id}`}
      onClick={() => markSignalSeen(signal.id)}
      className={cx(
        "group -mx-2 flex flex-wrap items-center gap-3 rounded-[10px] px-2 py-3.5 no-underline transition-console hover:bg-[#FAF9F7]",
        !last && "border-b border-divider rounded-b-none",
        justArrived && "rp-row-new",
      )}
    >
      <span className="flex w-2 shrink-0 justify-center" aria-hidden>
        {!signal.seen ? (
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        ) : null}
      </span>

      <span className="w-[52px] shrink-0 text-sm font-extrabold">
        {signal.company}
      </span>

      <span className="min-w-0 flex-[1_1_220px]">
        <span className="block text-[15px] font-bold leading-[1.35] text-ink">
          {signal.title}
          {!signal.seen ? (
            <span className="sr-only"> — new since your last check</span>
          ) : null}
        </span>
        <span className="mt-[3px] block text-[13px] text-muted">
          {signal.subline}
        </span>
      </span>

      <SeverityPill severity={signal.severity} />

      <span className="w-[58px] shrink-0 text-right text-[13px] text-muted">
        {shortDate(signal.detectedAt)}
      </span>

      {/* Makes the row read as navigable rather than as a static list item. */}
      <ChevronRight
        aria-hidden
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-neutral-300 transition-console group-hover:text-muted"
      />
    </Link>
  );
}
