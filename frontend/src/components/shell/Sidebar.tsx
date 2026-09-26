"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  Activity,
  Database,
  Eye,
  LayoutDashboard,
  Settings,
  Swords,
  Workflow,
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
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/signals", label: "Signals", icon: Activity },
      { href: "/watchlists", label: "Watchlists", icon: Eye },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/runs", label: "Agent runs", icon: Workflow },
      { href: "/battlecards", label: "Battlecards", icon: Swords },
      { href: "/sectors", label: "Sectors data", icon: Database },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { newSinceLastCheck, aggregates, profile } = useStore();

  return (
    // min-h-full so the footer card sits at the bottom, but the nav can still
    // grow past the viewport and scroll on a short window.
    <nav className="flex min-h-full flex-col gap-[22px] bg-sidebar px-3.5 py-5 lg:border-r lg:border-border">
      <div className="flex items-center gap-2.5 px-2">
        <Logo size={26} />
        <span className="text-[17px] font-extrabold tracking-[-0.02em]">
          RivalPulse
        </span>
      </div>

      {GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-strong">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-field px-3 py-2.5 text-sm no-underline transition-console",
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
                    "shrink-0 transition-console",
                    // The accent stays the active cue, as it was on the dots.
                    active ? "text-accent" : "text-muted",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {/* Unread count belongs where the user looks for it. */}
                {item.href === "/signals" && newSinceLastCheck > 0 ? (
                  <span
                    className={cx(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold",
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
          className="block rounded-user border border-border bg-surface p-2.5 no-underline transition-console hover:bg-[#EBE8E2]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-strong">
              Sectors credits
            </span>
            <span className="text-[13px] font-bold text-ink-2">
              {aggregates.credits.used}
              <span className="font-semibold text-muted">
                /{aggregates.credits.total}
              </span>
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
        </Link>
      ) : null}

      <Link
        href={"/profile" as Route}
        onClick={onNavigate}
        aria-current={pathname.startsWith("/profile") ? "page" : undefined}
        className={cx(
          "flex items-center gap-2.5 rounded-user border p-2.5 no-underline transition-console",
          pathname.startsWith("/profile")
            ? "border-accent-wash-border bg-accent-wash"
            : "border-border bg-surface hover:bg-[#EBE8E2]",
        )}
      >
        <Avatar name={profile.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold">{profile.name}</p>
          <p className="truncate text-xs text-muted">{profile.role}</p>
        </div>
      </Link>
      </div>
    </nav>
  );
}
