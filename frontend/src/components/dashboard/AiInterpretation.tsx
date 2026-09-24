"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardTitle, Pill, Skeleton } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

/**
 * The agent's read of the range.
 *
 * The pill row is the evidence discipline made visible: how much of this is
 * verified and how much is interpretation. Both the pills and the subject line
 * link through to the signal's evidence ledger — a claim the reader cannot
 * trace back is exactly what this product argues against.
 */
export function AiInterpretation() {
  const { aggregates, signals, loading } = useStore();
  const interpretation = aggregates?.interpretation;
  const counts = interpretation?.counts ?? {
    facts: 0,
    observedSignals: 0,
    hypotheses: 0,
  };

  // The interpretation is anchored to the most severe signal in the feed.
  const subject =
    signals.find((s) => s.severity === "high") ??
    signals.find((s) => s.severity === "medium") ??
    signals[0];

  return (
    <Card>
      <div className="mb-1.5">
        <CardTitle>AI interpretation</CardTitle>
      </div>

      {loading || !interpretation ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : (
        <>
          {subject ? (
            <p className="mb-2 text-[13px] text-muted">
              Based on{" "}
              <span className="font-semibold text-ink-2">
                {subject.company} · {subject.title}
              </span>
            </p>
          ) : null}
          <p className="text-sm leading-[1.55] text-ink-2">
            {interpretation.body}
          </p>
        </>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <Pill>
          {counts.facts} fact{counts.facts === 1 ? "" : "s"}
        </Pill>
        <Pill>
          {counts.observedSignals} observed signal
          {counts.observedSignals === 1 ? "" : "s"}
        </Pill>
        <Pill tone="accent">
          {counts.hypotheses} hypothes{counts.hypotheses === 1 ? "is" : "es"}
        </Pill>
      </div>

      {subject ? (
        <Link
          href={`/signals/${subject.id}`}
          className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink no-underline transition-console hover:text-accent"
        >
          See the evidence
          <ArrowRight aria-hidden size={14} strokeWidth={2} />
        </Link>
      ) : null}
    </Card>
  );
}
