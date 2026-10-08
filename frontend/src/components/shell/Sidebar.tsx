"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Activity, BellRing, Database, Lightbulb, PanelLeftClose, Settings, Sparkles, Swords, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useStore } from "@/lib/store";
import { cx } from "@/components/ui/primitives";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { visibleDestination } from "@/lib/navigation";
import { AgentControls } from "@/components/agent/AgentControls";

const GROUPS: { label: string; items: { href: Route; label: string; icon: LucideIcon }[] }[] = [
  { label: "Main", items: [
    { href: "/", label: "RivalPulse agent", icon: Sparkles },
    { href: "/signals", label: "What changed", icon: Activity },
    { href: "/actions", label: "Recommended actions", icon: Lightbulb },
    { href: "/watchlists", label: "Competitors", icon: Swords },
  ] },
  { label: "System", items: [
    { href: "/alerts", label: "Alerts", icon: BellRing },
    { href: "/settings", label: "Settings", icon: Settings },
  ] },
];

export function Sidebar({ onNavigate, onAgentAction, collapsed = false, onToggleCollapsed }: {
  onNavigate?: () => void; onAgentAction?: () => void; collapsed?: boolean; onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const { newSinceLastCheck, aggregates, profile, activeRun } = useStore();
  const runBusy = activeRun?.status === "queued" || activeRun?.status === "running";
  return <nav aria-label="Main navigation" data-collapsed={collapsed} className="rp-sidebar flex min-h-full flex-col gap-[22px] bg-sidebar px-3.5 py-5">
    <div className="flex h-11 shrink-0 items-center overflow-hidden">
      {onToggleCollapsed ? <button type="button" onClick={onToggleCollapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed}
        title={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="rp-sidebar-toggle ml-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-field text-muted hover:bg-accent-wash hover:text-accent-ink focus-visible:outline-2 focus-visible:outline-accent">
        <PanelLeftClose size={19} aria-hidden />
      </button> : <span className="ml-1 flex w-11 shrink-0 justify-center"><Logo size={26} plain /></span>}
      <span className="rp-sidebar-label ml-2" aria-hidden={collapsed}><Logo size={27} wordmark /></span>
    </div>
    {GROUPS.map((group) => <div key={group.label} className="flex flex-col gap-1">
      <p aria-hidden className="rp-sidebar-label h-6 overflow-hidden whitespace-nowrap px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-strong">{group.label}</p>
      {group.items.filter((item) => visibleDestination(item.href)).map((item) => {
        const active = item.href === "/" ? pathname === "/" : item.href === "/settings" ? ["/settings", "/sectors"].some((path) => pathname.startsWith(path)) : pathname.startsWith(item.href);
        const Icon = item.icon;
        const unread = item.href === "/signals" && newSinceLastCheck > 0 ? newSinceLastCheck : 0;
        const accessibleLabel = unread ? `${item.label}, ${unread} unread finding${unread === 1 ? "" : "s"}` : item.label;
        return <div key={item.href}>
          <Link href={item.href} onClick={onNavigate} aria-label={accessibleLabel}
            aria-current={active ? "page" : undefined} title={collapsed ? accessibleLabel : undefined}
            className={cx("rp-sidebar-link group relative flex min-h-11 items-center overflow-hidden rounded-field text-sm no-underline focus-visible:outline-2 focus-visible:outline-accent", active ? "bg-accent font-semibold text-surface" : "text-ink-2 hover:bg-[#e0ece5]")}>
            <span className="ml-1 flex w-11 shrink-0 items-center justify-center"><Icon size={17} strokeWidth={1.5} aria-hidden className={active ? "text-accent-bright" : "text-muted"} /></span>
            <span aria-hidden className="rp-sidebar-label min-w-0 flex-1 truncate pr-2">{item.label}</span>
            {/* Solid pill that inverts on the active row; collapsed, a ringed dot on the icon. */}
            {unread ? collapsed ? <span aria-hidden className={cx("absolute left-[34px] top-2 h-2 w-2 rounded-full ring-2", active ? "bg-surface ring-accent" : "bg-accent ring-sidebar")} /> : <span aria-hidden data-sidebar-count className={cx("mr-3 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums leading-none", active ? "bg-surface text-accent-ink" : "bg-accent text-surface")}>{unread > 99 ? "99+" : <AnimatedNumber value={unread} />}</span> : null}
            {item.href === "/" && runBusy ? <span aria-label="Investigation running" className={collapsed ? "absolute left-[34px] top-2" : "mr-3.5 flex shrink-0"}><span aria-hidden className={cx("block h-2 w-2 animate-pulse rounded-full", active ? "bg-accent-bright" : "bg-accent", collapsed && (active ? "ring-2 ring-accent" : "ring-2 ring-sidebar"))} /></span> : null}
          </Link>
          {item.href === "/" ? <AgentControls active={pathname === "/"} collapsed={collapsed} onAction={onAgentAction ?? onNavigate} /> : null}
        </div>;
      })}
    </div>)}
    <div className="mt-auto flex flex-col gap-2">
      {aggregates ? <Link href="/sectors" onClick={onNavigate} aria-label={`Research remaining: ${aggregates.credits.availablePercent}%`} title={collapsed ? "Research remaining" : undefined}
        className="flex min-h-16 items-center overflow-hidden rounded-user border border-border bg-surface no-underline hover:bg-subtle">
        <span className="ml-1 flex w-11 shrink-0 justify-center"><Database aria-hidden size={17} className="text-muted" /></span>
        <div className="rp-sidebar-label min-w-0 flex-1 py-2 pr-2.5" aria-hidden={collapsed} inert={collapsed}>
          <div className="flex items-baseline justify-between gap-1 whitespace-nowrap"><span className="text-[10px] font-bold uppercase text-muted-strong">Research left</span><span className="text-xs font-bold"><AnimatedNumber value={aggregates.credits.availablePercent} suffix="%" precision={1} /></span></div>
          <div role="meter" aria-label="Research allowance remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={aggregates.credits.availablePercent} className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle"><div className="rp-spring-fill h-full w-full origin-left rounded-full bg-accent" style={{ transform: `scaleX(${Math.max(0, Math.min(100, aggregates.credits.availablePercent)) / 100})` }} /></div>
        </div>
      </Link> : null}
      <Link href="/profile" onClick={onNavigate} aria-label={`Profile: ${profile.name}`} aria-current={pathname.startsWith("/profile") ? "page" : undefined} title={collapsed ? profile.name : undefined}
        className={cx("flex min-h-14 items-center overflow-hidden rounded-user border no-underline", pathname.startsWith("/profile") ? "border-accent-wash-border bg-accent-wash" : "border-border bg-surface hover:bg-subtle")}>
        <span className="ml-1 flex w-11 shrink-0 justify-center"><Avatar name={profile.name} size="md" /></span>
        <span aria-hidden className="rp-sidebar-label min-w-0 truncate pr-2 text-[13px] font-bold">{profile.name}</span>
      </Link>
    </div>
  </nav>;
}
