"use client";

import { Card, CardHeader, Skeleton, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { SIGNAL_CATEGORIES } from "@/lib/signal-categories";
import type { MixSlice } from "@/lib/types";

export function SignalMix({ mix, total, busy, category = "", onSelect }: {
  mix?: MixSlice[]; total?: number; busy?: boolean; category?: string; onSelect?: (value: string) => void;
}) {
  const { aggregates, loading } = useStore();
  const slices = mix ?? aggregates?.mix ?? [];
  const count = total ?? aggregates?.mixTotal ?? 0;
  const pending = busy ?? loading;
  return <Card className="min-w-0">
    <CardHeader title="Signal mix" aside={<span className="text-xs text-muted">{pending ? "Loading…" : `${count} findings`}</span>} />
    <p className="mb-4 text-xs leading-relaxed text-muted">All categories in the selected date and company scope. Select a category to filter findings.</p>
    {pending ? <div className="space-y-3">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-11 w-full" />)}</div> :
      <ul className="space-y-1">{SIGNAL_CATEGORIES.map((entry) => {
        const slice = slices.find((item) => item.label === entry.label);
        const share = slice?.percent ?? 0;
        const selected = category === entry.label;
        return <li key={entry.label}>
          <button type="button" disabled={!onSelect} aria-pressed={selected}
            aria-label={`${entry.label}: ${slice?.count ?? 0} findings, ${Math.round(share)} percent`}
            onClick={() => onSelect?.(entry.label)}
            className={cx("min-h-11 w-full rounded-field px-3 py-2 text-left transition-console disabled:cursor-default", selected ? "bg-subtle ring-1 ring-border" : "hover:bg-subtle")}>
            <span className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{entry.label}</span><span className="tabular-nums"><strong>{slice?.count ?? 0}</strong><span className="ml-3 text-xs text-muted">{Math.round(share)}%</span></span></span>
            <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-subtle"><span className="rp-spring-fill block h-full w-full origin-left rounded-full" style={{ transform: `scaleX(${Math.min(100, share) / 100})`, backgroundColor: entry.color }} /></span>
          </button>
        </li>;
      })}</ul>}
    {!pending && !count ? <p className="mt-3 text-xs text-muted">No findings in this date range. The chart will populate after research returns relevant evidence.</p> : null}
  </Card>;
}
