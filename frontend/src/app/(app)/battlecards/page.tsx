"use client";

import {
  Card,
  CardHeader,
  Disclaimer,
  EmptyState,
  PageTitle,
  Button,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";

export default function BattlecardsPage() {
  const { watchlist, signals } = useStore();

  return (
    <>
      <div>
        <PageTitle>Battlecards</PageTitle>
        <p className="mt-0.5 text-sm text-muted">
          One page per competitor, assembled from stored signals and their
          Sectors financial context.
        </p>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        {(watchlist?.companies ?? []).map((company) => {
          const owned = signals.filter((s) => s.company === company.ticker);
          const high = owned.filter((s) => s.severity === "high").length;
          return (
            <Card key={company.ticker} className="min-w-0 flex-[1_1_280px]">
              <CardHeader
                title={company.ticker}
                aside={
                  <span className="text-[13px] text-muted">
                    {company.industry}
                  </span>
                }
              />
              <p className="text-sm leading-[1.55] text-ink-2">
                {company.name}
              </p>
              <p className="mt-3.5 text-[13px] text-muted">
                {owned.length} stored signal{owned.length === 1 ? "" : "s"} ·{" "}
                {high} high severity
              </p>
              <div className="mt-3.5">
                <Button size="sm">Export battlecard</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <EmptyState
        title="Battlecard export is a nice-to-have"
        body="The MVP stores everything a battlecard needs — evidence, provenance and financial context. Wire the PDF export only once the core demo path is stable."
      />

      <Disclaimer />
    </>
  );
}
