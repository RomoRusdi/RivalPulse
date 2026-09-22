"use client";

import {
  Card,
  CardHeader,
  Disclaimer,
  PageTitle,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { USER } from "@/lib/mock-data";

export default function SettingsPage() {
  const { watchlist } = useStore();

  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Signed in as", value: `${USER.name} · ${USER.role}` },
    { label: "Active watchlist", value: watchlist?.name ?? "—" },
    {
      label: "Severity threshold",
      value: "Medium and above",
      note: "Below-threshold changes are stored but never alerted.",
    },
    {
      label: "Sectors refresh policy",
      value: "Financials 24 h · news 1 h",
      note: "Cached responses keep the 1,000-credit budget intact.",
    },
    {
      label: "Notifications",
      value: "In-app only",
      note: "Slack and email delivery are post-MVP.",
    },
  ];

  return (
    <>
      <div>
        <PageTitle>Settings</PageTitle>
        <p className="mt-0.5 text-sm text-muted">
          Thresholds and refresh policy decide how quiet the feed stays.
        </p>
      </div>

      <Card className="min-w-0">
        <CardHeader title="Workspace" />
        <dl className="flex flex-col">
          {rows.map((row, i) => (
            <div
              key={row.label}
              className={`flex flex-wrap items-baseline gap-3 py-3.5 ${
                i < rows.length - 1 ? "border-b border-divider" : ""
              }`}
            >
              <dt className="w-[180px] shrink-0 text-[13px] text-muted">
                {row.label}
              </dt>
              <dd className="min-w-0 flex-[1_1_220px]">
                <span className="block text-[15px] font-bold leading-[1.35]">
                  {row.value}
                </span>
                {row.note ? (
                  <span className="mt-[3px] block text-[13px] text-muted">
                    {row.note}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="min-w-0">
        <CardHeader title="Compliance" />
        <p className="text-sm leading-[1.55] text-ink-2">
          RivalPulse is an information and analysis product. It does not provide
          financial advice, recommend buying or selling securities, or execute
          trades. Outputs are phrased as competitive and business analysis, and
          every claim is labelled as a fact, an observed signal or an AI
          hypothesis.
        </p>
      </Card>

      <Disclaimer />
    </>
  );
}
