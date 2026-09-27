"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BellRing, Check, Mail, ShieldCheck } from "lucide-react";
import { Card, CardHeader, Disclaimer, PageTitle, Pill, Skeleton } from "@/components/ui/primitives";
import { getAlertStatus } from "@/lib/api";
import type { AlertStatus } from "@/lib/types";

export default function AlertsPage() {
  const [status, setStatus] = useState<AlertStatus | null>(null);

  useEffect(() => {
    let active = true;
    getAlertStatus().then((result) => {
      if (active) setStatus(result);
    }).catch(() => {
      if (active) setStatus({ enabled: false, provider: "gmail", recipient: null, minimum_severity: "high", delivery_policy: "Alert status could not be loaded." });
    });
    return () => { active = false; };
  }, []);

  return (
    <>
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline transition-console hover:text-accent">
        <ArrowLeft aria-hidden size={14} /> Back to settings
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Alerts</PageTitle>
          <p className="mt-0.5 max-w-[70ch] text-sm text-muted">
            Receive a bounded Gmail digest only when a newly detected competitor change is important enough to require attention.
          </p>
        </div>
        {status ? <Pill tone={status.enabled ? "accent" : "quiet"}>{status.enabled ? "Gmail active" : "Delivery not configured"}</Pill> : <Skeleton className="h-7 w-36" />}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="min-w-0">
          <CardHeader title="Gmail delivery" aside={<Mail aria-hidden size={18} className="text-accent" />} />
          {status ? (
            <dl className="flex flex-col gap-4">
              <StatusRow label="Provider" value="Gmail SMTP" />
              <StatusRow label="Recipient" value={status.recipient ?? "Not configured"} />
              <StatusRow label="Minimum severity" value={`${status.minimum_severity[0].toUpperCase()}${status.minimum_severity.slice(1)}`} />
              <StatusRow label="State" value={status.enabled ? "Ready to send" : "Disabled until server credentials are configured"} accent={status.enabled} />
            </dl>
          ) : (
            <div className="flex flex-col gap-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          )}
          <div className="mt-5 rounded-detail border border-divider bg-subtle p-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted">Server configuration</p>
            <pre className="mt-2 overflow-x-auto text-xs leading-[1.65] text-ink-2">{`ALERTS_ENABLED=true
ALERT_MIN_SEVERITY=high
ALERT_EMAIL_TO=marketing@example.com
GMAIL_ADDRESS=your-alert-account@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password`}</pre>
          </div>
          <p className="mt-3 text-[11px] leading-[1.5] text-muted">Credentials stay server-side. Use a Google App Password, never a Gmail account password.</p>
        </Card>

        <Card className="min-w-0">
          <CardHeader title="Anti-spam policy" aside={<ShieldCheck aria-hidden size={18} className="text-accent" />} />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["One digest per run", "Multiple important findings are grouped into one message."],
              ["No baseline email", "The first observation establishes state and does not trigger Gmail."],
              ["No unchanged email", "Repeated evidence updates last-seen state without another alert."],
              ["High severity by default", "Medium and low findings remain available in the application."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-detail border border-divider p-3.5">
                <p className="flex items-center gap-2 text-sm font-bold"><Check aria-hidden size={14} className="text-accent" />{title}</p>
                <p className="mt-1.5 text-[13px] leading-[1.5] text-muted">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-detail bg-ink-strong p-4 text-surface">
            <BellRing aria-hidden size={18} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-bold">What an email contains</p>
              <p className="mt-1 text-[13px] leading-[1.55] text-muted-on-dark">Competitor ticker, event category, severity, change status, headline, and a link back to the evidence. Gmail failures are logged but never invalidate a completed research run.</p>
            </div>
          </div>
        </Card>
      </div>

      <Disclaimer />
    </>
  );
}

function StatusRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-divider pb-3 last:border-0 last:pb-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className={accent ? "text-sm font-bold text-accent-ink" : "text-sm font-bold text-ink-2"}>{value}</dd>
    </div>
  );
}
