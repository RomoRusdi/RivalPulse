"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Activity,
  Database,
  FileText,
  History,
  LayoutDashboard,
  Lightbulb,
  PanelLeftClose,
  Settings,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cx } from "@/components/ui/primitives";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Icons are 17px at 1.5 stroke, per the handoff — heavier strokes fight the
 * light, low-contrast surfaces this design is built on.
 */
const ICON_SIZE = 17;
const ICON_STROKE = 1.5;

const GROUPS: {
  label: string;
  items: { href: Route; label: string; icon: LucideIcon }[];
}[] = [
  {
    label: "Main",
    items: [
      { href: "/", label: "RivalPulse agent", icon: Sparkles },
      { href: "/signals", label: "Signals", icon: Activity },
      { href: "/watchlists", label: "Competitors", icon: Swords },
    ],
  },
  {
    label: "Agent output",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/summary", label: "Summary report", icon: FileText },
      { href: "/actions", label: "Action suggestions", icon: Lightbulb },
      { href: "/timeline", label: "Signal timeline", icon: History },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const { newSinceLastCheck, aggregates, profile } = useStore();

  return (
    // min-h-full so the footer card sits at the bottom, but the nav can still
    // grow past the viewport and scroll on a short window.
    <nav
      className={cx(
        "flex min-h-full flex-col bg-sidebar px-3.5 py-5 lg:border-r lg:border-border",
        collapsed ? "gap-[18px]" : "gap-[22px]",
      )}
    >
      <div
        className={cx(
          "flex h-8 items-center px-1",
          collapsed ? "justify-center" : "justify-between gap-1",
        )}
      >
        {collapsed && onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand navigation"
            aria-expanded={false}
            title="Expand navigation"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] transition-console hover:bg-accent-wash active:scale-95"
          >
            <Logo size={24} />
          </button>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo size={26} />
              <span className="truncate text-[17px] font-extrabold tracking-[-0.02em]">
                RivalPulse
              </span>
            </div>
            {onToggleCollapsed ? (
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label="Collapse navigation"
                aria-expanded={true}
                title="Collapse navigation"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] bg-accent-wash text-accent-ink transition-console hover:bg-accent hover:text-white active:scale-95"
              >
                <PanelLeftClose aria-hidden size={17} strokeWidth={1.8} />
              </button>
            ) : null}
          </>
        )}
      </div>

      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          {collapsed ? (
            <div aria-hidden className="mx-2 mb-1 h-px bg-border" />
          ) : (
            <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-strong">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : item.href === "/settings"
                  ? ["/settings", "/alerts", "/sectors"].some((path) => pathname.startsWith(path))
                  : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cx(
                  "group relative flex items-center rounded-field py-2.5 text-sm no-underline transition-console active:scale-[0.98]",
                  collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                  active
                    ? "bg-ink-strong font-semibold text-surface"
                    : "text-ink-2 hover:bg-[#EBE8E2]",
                )}
              >
                <Icon
                  aria-hidden
                  size={ICON_SIZE}
                  strokeWidth={ICON_STROKE}
                  className={cx(
                    "shrink-0 transition-console group-hover:scale-105",
                    // The accent stays the active cue, as it was on the dots.
                    active ? "text-accent" : "text-muted",
                  )}
                />
                {!collapsed ? (
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                ) : (
                  <span className="sr-only">{item.label}</span>
                )}
                {/* Unread count belongs where the user looks for it. */}
                {item.href === "/signals" && newSinceLastCheck > 0 ? (
                  <span
                    className={cx(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                      collapsed && "absolute -top-1 -right-1 min-w-4 px-1 text-center text-[9px]",
                      active
                        ? "bg-accent text-white"
                        : "bg-accent-wash text-accent-ink",
                    )}
                  >
                    {newSinceLastCheck}
                    <span className="sr-only"> new signals</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}

      {/* mt-auto lives on the wrapper so the footer stays pinned even while
          the credit meter is still loading. */}
      <div className="mt-auto flex flex-col gap-2">
      {/* Credit budget: a system metric, so it sits out of the way rather than
          competing with competitive insight in the header. */}
      {aggregates ? (
        <Link
          href="/sectors"
          onClick={onNavigate}
          title={collapsed ? "Sectors credit usage" : undefined}
          className={cx(
            "rounded-user border border-border bg-surface no-underline transition-console hover:border-neutral-300 hover:bg-[#EBE8E2] active:scale-[0.98]",
            collapsed ? "flex h-11 items-center justify-center p-0" : "block p-2.5",
          )}
        >
          {collapsed ? (
            <Database aria-hidden size={17} strokeWidth={1.5} className="text-muted" />
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-strong">
                  Sectors credits
                </span>
                <span className="text-[13px] font-bold text-ink-2">
                  {aggregates.credits.used}<span className="font-semibold text-muted">/{aggregates.credits.total}</span>
                </span>
              </div>
              <div
                role="img"
                aria-label={`${aggregates.credits.used} of ${aggregates.credits.total} Sectors API credits used`}
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle"
              >
                <div
                  className="h-full rounded-full bg-accent transition-chart"
                  style={{
                    width: `${Math.round((aggregates.credits.used / aggregates.credits.total) * 100)}%`,
                  }}
                />
              </div>
            </>
          )}
        </Link>
      ) : null}

      <Link
        href={"/profile" as Route}
        onClick={onNavigate}
        aria-current={pathname.startsWith("/profile") ? "page" : undefined}
        title={collapsed ? `${profile.name} · ${profile.role}` : undefined}
        className={cx(
          "flex items-center rounded-user border p-2.5 no-underline transition-console",
          collapsed ? "justify-center" : "gap-2.5",
          pathname.startsWith("/profile")
            ? "border-accent-wash-border bg-accent-wash"
            : "border-border bg-surface hover:bg-[#EBE8E2]",
        )}
      >
        <Avatar name={profile.name} size="sm" />
        {collapsed ? <span className="sr-only">Profile</span> : (
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold">{profile.name}</p>
            <p className="truncate text-xs text-muted">{profile.role}</p>
          </div>
        )}
      </Link>
      </div>
    </nav>
  );
}
