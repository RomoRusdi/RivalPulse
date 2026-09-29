"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, Database } from "lucide-react";
import {
  Card,
  CardHeader,
  Disclaimer,
  PageTitle,
  Pill,
} from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { getAlertStatus } from "@/lib/api";
import type { AlertStatus } from "@/lib/types";

export default function SettingsPage() {
  const { watchlist, aggregates } = useStore();
  const [alertStatus, setAlertStatus] = useState<AlertStatus | null>(null);

  useEffect(() => {
    let active = true;
    getAlertStatus().then((status) => {
      if (active) setAlertStatus(status);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const rows: { label: string; value: string; note?: string }[] = [
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
      value: alertStatus?.enabled ? "Important changes via Gmail" : "In-app; Gmail available when configured",
      note: "Baseline and unchanged findings never generate email.",
    },
  ];

  return (
    <>
      <div>
        <PageTitle>Settings</PageTitle>
        <p className="mt-0.5 text-sm text-muted">
          Thresholds and refresh policy decide how quiet the feed stays. Your
          own details live in{" "}
          <Link
            href="/profile"
            className="font-semibold text-accent-ink no-underline transition-console hover:text-accent"
          >
            Profile
          </Link>
          .
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
        <CardHeader
          title="Data and notification integrations"
          aside={<span className="text-[13px] text-muted">Server-managed</span>}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href="/alerts"
            className="group rounded-detail border border-divider bg-subtle/50 p-4 no-underline transition-console hover:border-neutral-300 hover:bg-subtle active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-field bg-accent-wash text-accent-ink">
                <BellRing aria-hidden size={17} />
              </span>
              <Pill tone={alertStatus?.enabled ? "accent" : "quiet"}>
                {alertStatus?.enabled ? "Active" : "Not configured"}
              </Pill>
            </div>
            <h3 className="mt-3 text-[15px] font-bold">Important-change alerts</h3>
            <p className="mt-1 text-[13px] leading-[1.5] text-muted">
              Configure bounded Gmail digests, severity thresholds, recipient status, and anti-spam behavior.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink transition-console group-hover:text-accent">
              Manage alerts <ArrowRight aria-hidden size={14} />
            </span>
          </Link>

          <Link
            href="/sectors"
            className="group rounded-detail border border-divider bg-subtle/50 p-4 no-underline transition-console hover:border-neutral-300 hover:bg-subtle active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-field bg-ink-strong text-surface">
                <Database aria-hidden size={17} />
              </span>
              <Pill tone="quiet">
                {aggregates ? `${aggregates.credits.used}/${aggregates.credits.total} credits` : "Loading"}
              </Pill>
            </div>
            <h3 className="mt-3 text-[15px] font-bold">Sectors data</h3>
            <p className="mt-1 text-[13px] leading-[1.5] text-muted">
              Review provider-credit usage, cache effectiveness, endpoint activity, and freshness policy.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink transition-console group-hover:text-accent">
              View provider details <ArrowRight aria-hidden size={14} />
            </span>
          </Link>
        </div>
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
