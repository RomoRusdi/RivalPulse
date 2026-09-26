"use client";

import {
  Card,
  CardHeader,
  Disclaimer,
  PageTitle,
  Pill,
} from "@/components/ui/primitives";
import { AgentRunCard } from "@/components/dashboard/AgentRunCard";
import { useStore } from "@/lib/store";

import { RUN_HISTORY as HISTORY } from "@/lib/mock-data";

export default function RunsPage() {
  const { activeRun } = useStore();

  return (
    <>
      <div>
        <PageTitle>Agent runs</PageTitle>
        <p className="mt-0.5 text-sm text-muted">
          Each run stores its plan, tool calls and result so the next one can
          reason over change rather than starting from zero.
        </p>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-4">
          <Card className="min-w-0">
            <CardHeader
              title="Run history"
              aside={
                <span className="text-[13px] text-muted">Last 30 days</span>
              }
            />
            <div className="flex flex-col">
              {HISTORY.map((run, i) => (
                <div
                  key={run.id}
                  className={`flex flex-wrap items-center gap-3 py-3.5 ${
                    i < HISTORY.length - 1 ? "border-b border-divider" : ""
                  }`}
                >
                  <span className="w-[58px] shrink-0 text-sm font-extrabold">
                    #{run.id}
                  </span>
                  <span className="min-w-0 flex-[1_1_220px]">
                    <span className="block text-[15px] font-bold leading-[1.35]">
                      {run.query}
                    </span>
                    <span className="mt-[3px] block text-[13px] text-muted">
                      {run.at} · {run.toolCalls} tool calls ·{" "}
                      {run.sectorsCalls} Sectors calls
                    </span>
                  </span>
                  <Pill tone="neutral">
                    {run.delivered} delivered
                  </Pill>
                </div>
              ))}
            </div>
          </Card>

          {activeRun && activeRun.toolCalls.length > 0 ? (
            <Card className="min-w-0">
              <CardHeader title={`Tool calls · run #${activeRun.id}`} />
              <ol className="flex flex-col gap-2.5 text-sm">
                {activeRun.toolCalls.map((call, i) => (
                  <li key={i} className="flex flex-wrap gap-2">
                    <code className="rounded-[6px] bg-subtle px-2 py-0.5 text-[13px] font-semibold text-ink-2">
                      {call.name}()
                    </code>
                    <span className="text-[13px] text-muted">
                      {call.detail}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <AgentRunCard />
        </div>
      </div>

      <Disclaimer />
    </>
  );
}
