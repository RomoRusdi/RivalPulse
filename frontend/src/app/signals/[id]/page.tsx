"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { use, useEffect, useState } from "react";
import {
  Button,
  Disclaimer,
  ErrorCard,
  Pill,
  Skeleton,
} from "@/components/ui/primitives";
import { EvidenceLedger } from "@/components/signal/EvidenceLedger";
import { FinancialContext } from "@/components/signal/FinancialContext";
import { useStore } from "@/lib/store";
import { getSignal } from "@/lib/api";
import { longDate } from "@/lib/format";
import type { Severity, Signal } from "@/lib/types";

const SEVERITY_LABEL: Record<Severity, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export default function SignalDetailPage({
  params,
}: PageProps<"/signals/[id]">) {
  const { id } = use(params);
  const { signals, startRun, markSignalSeen } = useStore();
  const router = useRouter();

  // Prefer the copy already in the store; fall back to a direct fetch so a
  // deep link or a shared URL resolves without the dashboard having loaded.
  const fromStore = signals.find((s) => s.id === id);
  const [fetched, setFetched] = useState<Signal | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    fromStore ? "ready" : "loading",
  );

  useEffect(() => {
    if (fromStore) return;
    let cancelled = false;
    getSignal(id)
      .then((signal) => {
        if (cancelled) return;
        setFetched(signal);
        setState(signal ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [id, fromStore]);

  const signal = fromStore ?? fetched;
  const signalId = signal?.id;

  // Opening a signal is what marks it read. Keyed on the id, not the object:
  // marking it read changes the object, which would re-fire this forever.
  useEffect(() => {
    if (signalId) markSignalSeen(signalId);
  }, [signalId, markSignalSeen]);

  if (state === "loading" || !signal) {
    return state === "missing" ? (
      <>
        <BackLink />
        <ErrorCard message="This signal is not in the current research state. It may belong to an older run, or the stored state may have been rebuilt." />
      </>
    ) : (
      <DetailSkeleton />
    );
  }

  return (
    <>
      <BackLink />

      <div className="flex flex-wrap items-center gap-2.5">
        <Pill
          tone={
            signal.severity === "high"
              ? "accent"
              : signal.severity === "medium"
                ? "neutral"
                : "quiet"
          }
        >
          {SEVERITY_LABEL[signal.severity]} severity
        </Pill>
        <Pill>
          {signal.company} · {signal.type}
        </Pill>
        <span className="text-[13px] text-muted">
          Detected {longDate(signal.detectedAt)} · run #{signal.runId}
        </span>
      </div>

      <h1 className="max-w-[26ch] text-[clamp(24px,3vw,34px)] font-bold leading-[1.12] tracking-[-0.035em]">
        {signal.headline}
      </h1>

      <div className="flex flex-wrap items-stretch gap-4">
        <EvidenceLedger evidence={signal.evidence} />
        <FinancialContext data={signal.financialContext} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4 text-[13px] text-muted">
        <span>
          Stored {signal.storedAt} · compared against run #
          {signal.comparedAgainstRunId}
        </span>
        <div className="flex gap-2.5">
          <Button>Export battlecard</Button>
          <Button
            variant="primary"
            onClick={() => {
              startRun(`Investigate ${signal.company}: ${signal.title}`);
              router.push("/");
            }}
          >
            Investigate deeper
          </Button>
        </div>
      </div>

      <Disclaimer />
    </>
  );
}

function BackLink() {
  return (
    <div>
      <Link
        href="/signals"
        className="inline-flex items-center gap-1.5 text-[13px] text-accent-ink no-underline transition-console hover:text-accent"
      >
        <ArrowLeft aria-hidden size={14} strokeWidth={1.75} />
        Back to signals
      </Link>
    </div>
  );
}

/** Same dimensions as the real thing, so nothing shifts when it arrives. */
function DetailSkeleton() {
  return (
    <>
      <BackLink />
      <div className="flex gap-2.5">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-36 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-[26ch]" />
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-0 flex-[1.3_1_360px] flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-detail" />
          ))}
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          <Skeleton className="h-48 w-full rounded-detail" />
          <Skeleton className="h-20 w-full rounded-detail" />
          <Skeleton className="h-28 w-full rounded-detail" />
        </div>
      </div>
    </>
  );
}
