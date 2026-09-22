"use client";

import {
  Card,
  CardHeader,
  Disclaimer,
  PageTitle,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

/**
 * Credit budget and cache state. The hackathon grants 1,000 Sectors credits
 * for the whole team, so the refresh policy is a product surface, not a
 * backend detail.
 */
const ENDPOINTS = [
  { name: "Company profile", calls: 84, cached: 61, freshness: "6 h" },
  { name: "Financial performance", calls: 96, cached: 58, freshness: "24 h" },
  { name: "Industry context", calls: 72, cached: 52, freshness: "24 h" },
  { name: "Company news", calls: 60, cached: 29, freshness: "1 h" },
];

export default function SectorsPage() {
  const { aggregates } = useStore();
  const { used, total, cacheHitRate } = aggregates?.credits ?? {
    used: 0,
    total: 1000,
    cacheHitRate: 0,
  };
  const percent = Math.round((used / total) * 100);

  return (
    <>
      <div>
        <PageTitle>Sectors data</PageTitle>
        <p className="mt-0.5 text-sm text-muted">
          Every financial fact in a signal traces back to a Sectors v2 call.
          Remove this source and the product stops being intelligence.
        </p>
      </div>

      <div className="flex flex-wrap justify-between gap-[22px] rounded-card bg-ink-strong p-5 text-surface md:px-[22px]">
        <div className="flex-1 basis-50">
          <p className="text-[19px] font-bold tracking-[-0.02em]">
            {used} of {total} API credits used
          </p>
          <p className="mt-1 text-sm text-muted-on-dark">
            Caching has absorbed {Math.round(cacheHitRate * 100)}% of requests.
            At this rate the budget lasts through the demo.
          </p>
          <div
            role="img"
            aria-label={`${percent}% of credits used`}
            className="mt-3.5 h-[22px] overflow-hidden rounded-bar bg-white/10"
          >
            <div
              className="h-full rounded-bar bg-accent transition-chart"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Endpoint usage"
          aside={<span className="text-[13px] text-muted">This month</span>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-divider text-left">
                <th className="pb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Endpoint
                </th>
                <th className="pb-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Calls
                </th>
                <th className="pb-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Cache hits
                </th>
                <th className="pb-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Refresh
                </th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((row) => (
                <tr key={row.name} className="border-b border-divider last:border-0">
                  <td className="py-3.5 font-bold">{row.name}</td>
                  <td className="py-3.5 text-right">{row.calls}</td>
                  <td className="py-3.5 text-right text-muted">{row.cached}</td>
                  <td className="py-3.5 text-right text-muted">
                    {row.freshness}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 border-t border-divider pt-4 text-[13px] text-muted">
          Cached values are always labelled as cached in a signal. Stale data is
          never silently substituted for fresh.
        </p>
      </Card>

      <Disclaimer />
    </>
  );
}
