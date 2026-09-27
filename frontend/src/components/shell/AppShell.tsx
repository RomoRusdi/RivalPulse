"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { DatabaseZap, Menu, Sparkles } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { DebugPanel } from "./DebugPanel";
import { SearchField } from "./SearchField";
import { MobileDrawer } from "./MobileDrawer";
import { UserMenu } from "./UserMenu";
import { useStore } from "@/lib/store";

/**
 * The app shell: sidebar + top bar + routed main, filling the viewport.
 *
 * The design reference drew each screen as a rounded card floating on a canvas
 * — that was a presentation device for showing two screens on one page, not a
 * layout instruction. A console fills its window: the sidebar runs the full
 * height and main scrolls on its own, so the top bar stays put.
 *
 * At >= 1024px the sidebar is static. Below that it becomes an off-canvas
 * drawer opened from a menu button.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode } = useStore();
  const isAgentWorkspace = pathname === "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => setSidebarCollapsed((current) => !current);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface">
      {/* Keyboard users shouldn't have to tab the whole sidebar every page. */}
      <a
        href="#main"
        className="sr-only rounded-field bg-ink-strong px-4 py-2 text-sm font-semibold text-surface focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-60"
      >
        Skip to content
      </a>

      {/* Static sidebar from lg up, scrolling independently of main */}
      <div
        className={`hidden h-full shrink-0 overflow-y-auto transition-[width] duration-200 ease-[var(--ease-enter)] lg:block ${
          sidebarCollapsed ? "w-20" : "w-[244px]"
        }`}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      </div>

      {/* Off-canvas drawer below lg */}
      {drawerOpen ? (
        <MobileDrawer onClose={() => setDrawerOpen(false)} />
      ) : null}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3.5 md:px-[22px]">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-field border border-border bg-subtle text-ink-2 transition-console hover:bg-[#EBE8E2] lg:hidden"
          >
            <Menu aria-hidden size={18} strokeWidth={1.5} />
          </button>

          {isAgentWorkspace ? (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-field bg-accent-wash text-accent-ink">
                <Sparkles aria-hidden size={16} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-ink">RivalPulse agent</p>
                <p className="hidden truncate text-[11px] text-muted sm:block">Plans, investigates, compares, and cites</p>
              </div>
            </div>
          ) : (
            <SearchField />
          )}

          {/* ml-auto pins the actions to the right edge. Without it they sit
              flush against the capped search field, leaving the bar looking
              unbalanced on a wide window. */}
          <div className="flex shrink-0 items-center gap-2.5 sm:ml-auto">
            <UserMenu />
          </div>
        </header>

        {mode === "yahoo" ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-accent-wash-border bg-accent-wash px-4 py-2 text-[12px] text-ink-2 md:px-[22px]">
            <DatabaseZap aria-hidden size={14} className="shrink-0 text-accent-ink" />
            <span>
              <strong className="font-extrabold text-accent-ink">Yahoo testing mode</strong>
              {" · "}Development-only financial data is active. Verify the final investigation with Sectors before presenting it.
            </span>
          </div>
        ) : mode === "replay" ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-subtle px-4 py-2 text-[12px] text-muted md:px-[22px]">
            <DatabaseZap aria-hidden size={14} className="shrink-0" />
            <span><strong className="font-extrabold text-ink-2">Test fixture mode</strong>{" · "}Synthetic evidence is restricted to automated testing.</span>
          </div>
        ) : null}

        <main
          id="main"
          tabIndex={-1}
          className={`min-w-0 flex-1 ${isAgentWorkspace ? "overflow-hidden p-0" : "overflow-y-auto p-4 md:p-[22px]"}`}
        >
          <div
            key={pathname}
            className={`rp-page-enter min-w-0 ${isAgentWorkspace ? "h-full" : "flex flex-col gap-4"}`}
          >
            {children}
          </div>
        </main>
      </div>

      <DebugPanel />
    </div>
  );
}
