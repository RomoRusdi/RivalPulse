"use client";

import { useMemo, useState } from "react";
import { Check, CircleDashed, Lightbulb, TrendingUp } from "lucide-react";
import { Card, CardHeader, Disclaimer, PageTitle, Pill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import type { SignalType } from "@/lib/types";

const ACTIONS: Record<SignalType, string[]> = {
  Pricing: [
    "Audit price and value claims across active campaign landing pages.",
    "Build a value-comparison message that avoids unsupported competitor claims.",
    "Brief sales enablement on likely pricing objections and approved responses.",
  ],
  Product: [
    "Map the competitor launch against your current feature narrative.",
    "Create proof-led differentiation content for the overlapping customer need.",
    "Test one response campaign before changing the broader brand message.",
  ],
  Partnership: [
    "Identify the audience and distribution advantage the partnership may unlock.",
    "Prepare ecosystem proof points and partner-led customer stories.",
    "Monitor whether the announcement becomes an active commercial campaign.",
  ],
  Campaign: [
    "Capture the competitor's recurring message, audience, and call to action.",
    "Test a differentiated creative angle rather than mirroring its campaign.",
    "Track share of observed signals and message repetition in the next sweep.",
  ],
};

const SCENARIOS = {
  conservative: { label: "Conservative", after: 106, confidence: "Higher confidence" },
  base: { label: "Base case", after: 112, confidence: "Directional" },
  ambitious: { label: "Ambitious", after: 118, confidence: "Lower confidence" },
} as const;

type Scenario = keyof typeof SCENARIOS;

export default function ActionsPage() {
  const { signals } = useStore();
  const [scenario, setScenario] = useState<Scenario>("base");
  const [completed, setCompleted] = useState<number[]>([]);
  const priority = useMemo(
    () => signals.find((signal) => signal.severity === "high") ?? signals.find((signal) => signal.severity === "medium") ?? signals[0],
    [signals],
  );
  const suggestions = priority ? ACTIONS[priority.type] : [];
  const selected = SCENARIOS[scenario];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Action suggestions</PageTitle>
          <p className="mt-0.5 max-w-[72ch] text-sm text-muted">
            Evidence-linked marketing responses for the most important competitor move. Actions are recommendations, not guaranteed financial outcomes.
          </p>
        </div>
        <Pill tone="accent">AI-assisted · human approval required</Pill>
      </div>

      {priority ? (
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="min-w-0">
            <CardHeader title="Recommended response plan" aside={<span className="text-[13px] font-bold text-accent-ink">{priority.company} · {priority.type}</span>} />
            <div className="rounded-detail bg-ink-strong p-4 text-surface">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-accent">Trigger signal</p>
              <p className="mt-1.5 text-[17px] font-bold leading-[1.4]">{priority.title}</p>
              <p className="mt-2 text-[13px] leading-[1.55] text-muted-on-dark">{priority.financialContext.whyItMatters}</p>
            </div>

            <ol className="mt-4 flex flex-col gap-2.5">
              {suggestions.map((action, index) => {
                const done = completed.includes(index);
                return (
                  <li key={action}>
                    <button
                      type="button"
                      onClick={() => setCompleted((current) => done ? current.filter((item) => item !== index) : [...current, index])}
                      className={cx(
                        "flex w-full cursor-pointer items-start gap-3 rounded-detail border p-3 text-left transition-console active:scale-[0.99]",
                        done ? "border-accent-wash-border bg-accent-wash" : "border-divider bg-subtle/50 hover:border-neutral-300 hover:bg-subtle",
                      )}
                    >
                      <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", done ? "border-accent bg-accent text-white" : "border-neutral-300 text-muted")}>
                        {done ? <Check aria-hidden size={12} strokeWidth={3} /> : <CircleDashed aria-hidden size={12} />}
                      </span>
                      <span className={cx("text-sm leading-[1.5]", done && "text-ink-2 line-through decoration-accent/50")}>{action}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card className="min-w-0">
            <CardHeader title="Illustrative impact scenario" aside={<TrendingUp aria-hidden size={18} className="text-accent" />} />
            <p className="text-[13px] leading-[1.55] text-muted">
              A demonstration of how a coordinated response could influence a commercial-impact index. It is not a revenue forecast and is not generated from enough evidence to promise an outcome.
            </p>

            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Impact scenario">
              {(Object.entries(SCENARIOS) as [Scenario, (typeof SCENARIOS)[Scenario]][]).map(([id, item]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={scenario === id}
                  onClick={() => setScenario(id)}
                  className={cx(
                    "cursor-pointer rounded-[9px] px-3 py-1.5 text-xs font-bold transition-console active:scale-[0.97]",
                    scenario === id ? "bg-ink-strong text-surface" : "border border-border bg-subtle text-ink-2 hover:bg-[#EBE8E2]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-detail border border-divider bg-subtle/55 p-4">
              <div className="grid h-52 grid-cols-2 items-end gap-8 border-b border-divider px-5">
                <ImpactBar label="Before response" value={100} height={58} muted />
                <ImpactBar label="After response" value={selected.after} height={Math.min(92, 58 + (selected.after - 100) * 2.2)} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
                <span className="text-muted">Scenario confidence</span>
                <span className="font-bold">{selected.confidence}</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                ["Baseline", "100", "Current indexed position"],
                ["Scenario", `+${selected.after - 100}%`, "Illustrative commercial impact"],
                ["Review window", "30 days", "Measure before scaling"],
              ].map(([label, value, note]) => (
                <div key={label} className="rounded-detail border border-divider p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
                  <p className="mt-1 text-xl font-extrabold">{value}</p>
                  <p className="mt-1 text-[11px] leading-[1.4] text-muted">{note}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card><div className="flex items-center gap-3"><Lightbulb aria-hidden className="text-accent" /><p className="text-sm text-muted">Run an investigation to create evidence-linked action suggestions.</p></div></Card>
      )}

      <Disclaimer />
    </>
  );
}

function ImpactBar({ label, value, height, muted = false }: { label: string; value: number; height: number; muted?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-end">
      <span className="mb-2 text-lg font-extrabold tabular-nums">{value}</span>
      <div
        className={cx("w-full max-w-28 rounded-t-[10px] transition-chart", muted ? "bg-neutral-300" : "bg-accent")}
        style={{ height: `${height}%` }}
      />
      <span className="my-2 text-center text-xs font-semibold text-muted">{label}</span>
    </div>
  );
}
