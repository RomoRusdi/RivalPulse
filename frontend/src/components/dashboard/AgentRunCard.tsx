"use client";

import Link from "next/link";
import {
  Button,
  Card,
  CardTitle,
  Pill,
  cx,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { clock } from "@/lib/format";
import { NEXT_SCHEDULED_RUN, RUN_STEPS } from "@/lib/mock-data";

/**
 * The agent run card. It carries every run state the handoff specifies:
 * idle -> queued -> running (step by step) -> complete, plus failed with a
 * retry. Making the plan visible is the point — a judge should be able to see
 * the agent reason, not just wait on a spinner.
 */
export function AgentRunCard() {
  const { activeRun, cancelRun, retryRun, dismissRun, startRun } = useStore();

  const status = activeRun?.status ?? "idle";
  const steps = activeRun?.steps ?? RUN_STEPS;
  const currentStep = activeRun?.currentStep ?? -1;

  return (
    <Card>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <CardTitle>Agent run</CardTitle>
        <RunStatusPill />
      </div>

      {/* The stepper is a live process; without this it advances silently. */}
      <p aria-live="polite" className="sr-only">
        {status === "running" && steps[currentStep]
          ? `Step ${currentStep + 1} of ${steps.length}: ${steps[currentStep].label}`
          : status === "complete"
            ? "Agent run complete."
            : status === "failed"
              ? "Agent run failed."
              : status === "queued"
                ? "Agent run queued."
                : ""}
      </p>

      {status === "idle" ? (
        <>
          {/* Idle is the state a judge sees first, so it reports what the last
              run actually did rather than just saying "nothing running". */}
          <dl className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Last run</dt>
              <dd className="text-right font-semibold text-ink-2">
                #0142 · found 4 signals in 2m 13s
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Next scheduled</dt>
              <dd className="text-right font-semibold text-ink-2">
                {NEXT_SCHEDULED_RUN}
              </dd>
            </div>
          </dl>
          <div className="mt-3.5 border-t border-divider pt-3.5">
            <Button
              size="sm"
              onClick={() =>
                startRun("Weekly sweep: what changed across my watchlist?")
              }
            >
              Run sweep now
            </Button>
            {/* Named to separate it from "+ Investigate", which asks a
                question; this re-runs the standing weekly sweep. */}
            <p className="mt-2 text-[13px] text-muted">
              Re-runs the standing sweep. Use Investigate to ask a specific
              question.
            </p>
          </div>
        </>
      ) : (
        <>
          <ol className="flex flex-col gap-3 text-sm">
            {steps.map((step, index) => {
              const done = index < currentStep || status === "complete";
              const current = index === currentStep && status === "running";
              const failed = status === "failed" && index === currentStep;

              return (
                <li
                  key={step.id}
                  className={cx(
                    "flex items-center gap-2.5",
                    current && "font-bold",
                    failed && "font-bold text-accent-ink",
                    !done && !current && !failed && "text-muted-on-dark",
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      "h-2 w-2 shrink-0 rounded-full transition-console",
                      failed
                        ? "bg-accent-ink"
                        : done
                          ? "bg-accent"
                          : current
                            ? "bg-ink-strong shadow-step animate-step-pulse"
                            : "bg-neutral-200",
                    )}
                  />
                  {step.label}
                </li>
              );
            })}
          </ol>

          {status === "complete" && activeRun?.resultSummary ? (
            <p className="mt-3.5 rounded-detail bg-subtle p-3 text-[13px] leading-[1.55] text-ink-2">
              {activeRun.resultSummary}
            </p>
          ) : null}

          {status === "failed" && activeRun ? (
            <p className="mt-3.5 rounded-detail border border-accent-wash-border bg-accent-wash p-3 text-[13px] leading-[1.55] text-ink-2">
              Tool call <span className="font-bold">{activeRun.failedTool}</span>{" "}
              did not return. No stale data has been substituted.
            </p>
          ) : null}

          <RunFooter
            onCancel={cancelRun}
            onRetry={retryRun}
            onDismiss={dismissRun}
          />
        </>
      )}
    </Card>
  );
}

function RunStatusPill() {
  const { activeRun } = useStore();
  if (!activeRun) return <Pill tone="quiet">Idle</Pill>;

  switch (activeRun.status) {
    case "queued":
      return <Pill tone="neutral">Queued</Pill>;
    case "running":
      return (
        <Pill tone="accent">Running · {clock(activeRun.elapsedSeconds)}</Pill>
      );
    case "complete":
      return (
        <Pill tone="neutral">Complete · {clock(activeRun.elapsedSeconds)}</Pill>
      );
    case "failed":
      return <Pill tone="accent">Failed</Pill>;
    default:
      return <Pill tone="quiet">Idle</Pill>;
  }
}

function RunFooter({
  onCancel,
  onRetry,
  onDismiss,
}: {
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const { activeRun } = useStore();
  if (!activeRun) return null;

  const running =
    activeRun.status === "running" || activeRun.status === "queued";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3.5 text-[13px] text-muted">
      {running ? (
        <>
          <span>
            {activeRun.etaSeconds > 0
              ? `~${Math.max(1, Math.round(activeRun.etaSeconds / 60))} min left`
              : "Finishing up"}{" "}
            · you can leave this page
          </span>
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </>
      ) : activeRun.status === "complete" ? (
        <>
          <span>Stored as run #{activeRun.id}</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
            <Link
              href="/signals"
              className="inline-flex cursor-pointer items-center rounded-[9px] bg-accent px-3 py-1.5 text-[13px] font-bold text-white no-underline transition-console hover:bg-accent-hover"
            >
              View signals
            </Link>
          </div>
        </>
      ) : (
        <>
          <span>Run #{activeRun.id} stopped</span>
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </>
      )}
    </div>
  );
}
