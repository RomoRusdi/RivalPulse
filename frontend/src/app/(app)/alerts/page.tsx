"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BellRing, Check, Mail, ShieldCheck } from "lucide-react";
import { Button, Card, CardHeader, Disclaimer, PageTitle, Pill, Skeleton } from "@/components/ui/primitives";
import { useAlertStatus } from "@/lib/use-alert-status";

export default function AlertsPage() {
  const { status, error, loading, retry } = useAlertStatus();
  const delivery = loading ? "Checking delivery" : error ? "Status unavailable" : status?.enabled ? "Email alerts on" : "Email alerts off";

  return (
    <>
      <Link href="/settings" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-accent-ink no-underline transition-console hover:text-accent">
        <ArrowLeft aria-hidden size={14} /> Back to settings
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Alerts</PageTitle>
          <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted">Keep important competitor changes in view, with a link to the evidence behind each finding.</p>
        </div>
        <Pill tone={status?.enabled ? "accent" : "quiet"}>{delivery}</Pill>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader title="In-app notifications" aside={<BellRing aria-hidden size={20} className="text-accent" />} />
          <Pill tone="accent">Available</Pill>
          <p className="mt-4 text-sm leading-relaxed text-ink-2">Research updates appear while you use RivalPulse. Your findings remain available in What changed.</p>
          <Link href="/signals" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent-ink no-underline hover:text-accent">View findings <ArrowRight aria-hidden size={15} /></Link>
        </Card>
        <Card className="min-w-0">
          <CardHeader title="Email digests" aside={<Mail aria-hidden size={20} className="text-accent" />} />
          {loading ? (
            <div aria-label="Checking email delivery" className="flex flex-col gap-3"><Skeleton className="h-7 w-32" /><Skeleton className="h-12 w-full" /></div>
          ) : error ? (
            <div role="status"><p className="text-sm leading-relaxed text-muted">{error}</p><Button className="mt-4" onClick={retry}>Try again</Button></div>
          ) : status?.enabled ? (
            <>
              <Pill tone="accent">On</Pill>
              <dl className="mt-4 flex flex-col gap-4">
                <StatusRow label="Delivered to" value={status.recipient ?? "Workspace recipient"} />
                <StatusRow label="Finding priority" value={status.minimum_severity === "high" ? "High" : `${status.minimum_severity[0].toUpperCase()}${status.minimum_severity.slice(1)} and above`} />
                <StatusRow label="Frequency" value="Grouped after each investigation" />
              </dl>
            </>
          ) : (
            <>
              <Pill tone="quiet">Off for this workspace</Pill>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">Email digests aren’t enabled for this workspace. You can still review all findings in RivalPulse.</p>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">Contact your workspace administrator to discuss email availability.</p>
            </>
          )}
        </Card>
      </div>
      <Card className="min-w-0">
        <CardHeader title="Focused on meaningful changes" aside={<ShieldCheck aria-hidden size={20} className="text-accent" />} />
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Grouped updates", "When email is enabled, eligible findings from one investigation are grouped into a single digest."],
            ["Changes, not repeats", "Initial observations and unchanged evidence do not trigger email digests."],
            ["Evidence within reach", "Digests link back to the finding so you can review its sources, priority, and context."],
          ].map(([title, body]) => (
            <div key={title} className="rounded-detail border border-divider p-4">
              <p className="flex items-center gap-2 text-sm font-bold"><Check aria-hidden size={15} className="shrink-0 text-accent" />{title}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 border-t border-divider pt-4 text-[13px] leading-relaxed text-muted">A quiet inbox does not establish that nothing changed. Check research coverage for unavailable sources or evidence that could not be verified.</p>
      </Card>
      <Disclaimer />
    </>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-divider pb-3 last:border-0 last:pb-0"><dt className="text-[13px] text-muted">{label}</dt><dd className="break-all text-sm font-bold text-ink-2">{value}</dd></div>;
}

