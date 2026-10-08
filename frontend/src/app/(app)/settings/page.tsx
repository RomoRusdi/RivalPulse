"use client";

import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { Card, CardHeader, Disclaimer, PageTitle, Pill } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { ModelSettings } from "@/components/settings/ModelSettings";
import { SectorsSettings } from "@/components/settings/SectorsSettings";

export default function SettingsPage() {
  const { watchlist, aggregates, error } = useStore();
  const rows = [
    { label: "Active watchlist", value: watchlist?.name ?? (error ? "Temporarily unavailable" : "Loading…"), note: "Manage companies and your perspective in Competitors." },
    { label: "Finding categories", value: "Pricing, Product, Partnership, Campaign, Financial update, Analyst commentary and Market context", note: "Browse findings by category, company and date added." },
    { label: "Sectors refresh policy", value: "Recently retrieved evidence is reused", note: "Sources, reporting periods and coverage remain available in research results." },
    { label: "Workspace notifications", value: "In-app research updates", note: "Completed investigations remain available in your research history." },
  ];
  return <>
    <div><PageTitle>Settings</PageTitle><p className="mt-1 text-sm text-muted">Review your workspace and research data. Update your account in <Link href="/profile" className="font-semibold text-accent-ink">Profile</Link>.</p></div>
    <Card><CardHeader title="Workspace" /><dl>{rows.map((row, index) => <div key={row.label} className={`grid gap-2 py-4 sm:grid-cols-[180px_minmax(0,1fr)] ${index < rows.length - 1 ? "border-b border-divider" : ""}`}><dt className="text-sm text-muted">{row.label}</dt><dd><p className="text-sm font-semibold">{row.value}</p><p className="mt-1 text-xs leading-relaxed text-muted">{row.note}</p></dd></div>)}</dl></Card>
    <SectorsSettings />
    <ModelSettings />
    <Card><CardHeader title="Research data" /><Link href="/sectors" className="flex flex-wrap items-center gap-4 rounded-detail border border-divider p-4 no-underline hover:bg-subtle">
      <span className="flex h-11 w-11 items-center justify-center rounded-field bg-accent-wash text-accent-ink"><Database aria-hidden size={20} /></span>
      <div className="min-w-0 flex-1"><h3 className="font-bold">Sectors data</h3><p className="mt-1 text-sm text-muted">Research allowance, reused evidence and data sources.</p></div>
      <Pill tone="quiet">{error ? "Unavailable" : aggregates ? `${aggregates.credits.used}/${aggregates.credits.total} credits` : "Loading"}</Pill><ArrowRight aria-hidden size={16} />
    </Link></Card>
    <Card><CardHeader title="About your research" /><p className="text-sm leading-relaxed text-ink-2">RivalPulse provides information and competitive analysis. Every finding retains its supporting evidence. Annual financial context and recent company activity are presented separately; unavailable sources and uncertain interpretations are disclosed.</p></Card>
    <Disclaimer />
  </>;
}
