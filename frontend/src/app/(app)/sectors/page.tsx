"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardHeader,
  Disclaimer,
  PageTitle,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

const PROVIDER_POLICY = [
  { stage: "Financial context", source: "Sectors v2 reports", purpose: "Annual financial statements and company data", freshness: "24 h" },
  { stage: "Structured news", source: "Sectors v2 news", purpose: "Bounded company announcements", freshness: "1 h" },
  { stage: "Competitive signals", source: "Approved company pages", purpose: "Product, price, campaign, and partnership changes", freshness: "1 h" },
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
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline transition-console hover:text-accent">
        <ArrowLeft aria-hidden size={14} /> Back to settings
      </Link>
      <div>
        <PageTitle>Financial data provider</PageTitle>
        <p className="mt-0.5 text-sm text-muted">
          Sectors v2 is the sole live financial provider. Verify key access before running a credit-consuming investigation.
        </p>
      </div>

      <div className="flex flex-wrap justify-between gap-[22px] rounded-card bg-ink-strong p-5 text-surface md:px-[22px]">
        <div className="flex-1 basis-50">
          <p className="text-[19px] font-bold tracking-[-0.02em]">
            {used} of {total} Sectors credits used
          </p>
          <p className="mt-1 text-sm text-muted-on-dark">
            Caching has absorbed {Math.round(cacheHitRate * 100)}% of requests.
          </p>
          <div
            role="img"
            aria-label={`${percent}% of credits used`}
            className="mt-3.5 h-[22px] overflow-hidden rounded-bar bg-white/10"
          >
            <div className="h-full rounded-bar bg-accent transition-chart" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <Card className="min-w-0">
        <CardHeader
          title="Provider policy"
          aside={<span className="text-[13px] text-muted">No automatic fallback</span>}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-divider text-left">
                <th className="pb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Stage
                </th>
                <th className="pb-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Source
                </th>
                <th className="pb-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Purpose
                </th>
                <th className="pb-2.5 text-right text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Refresh
                </th>
              </tr>
            </thead>
            <tbody>
              {PROVIDER_POLICY.map((row) => (
                <tr
                  key={row.stage}
                  className="border-b border-divider transition-console hover:bg-subtle/70 last:border-0"
                >
                  <td className="py-3.5 font-bold">{row.stage}</td>
                  <td className="py-3.5 text-right">{row.source}</td>
                  <td className="py-3.5 text-right text-muted">{row.purpose}</td>
                  <td className="py-3.5 text-right text-muted">
                    {row.freshness}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 border-t border-divider pt-4 text-[13px] text-muted">
          Sectors keys stay on the server. Replay fixtures are for automated tests only; a failed Sectors request never substitutes another provider.
        </p>
      </Card>

      <Disclaimer />
    </>
  );
}
