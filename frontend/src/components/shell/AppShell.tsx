"use client";

import { useEffect, useRef, useState, ViewTransition } from "react";
import { usePathname } from "next/navigation";
import { DatabaseZap, Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { DebugPanel } from "./DebugPanel";
import { RunIndicator } from "./RunIndicator";
import { pageLabel } from "@/lib/navigation";
import { MobileDrawer } from "./MobileDrawer";
import { UserMenu } from "./UserMenu";
import { useStore } from "@/lib/store";
import { DEMO_CONTROLS_ENABLED } from "@/lib/demo-settings";

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
  const { mode, activeRun } = useStore();
  const isAgentWorkspace = pathname === "/";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const baseTitle = useRef<string | null>(null);

  // A run in progress must stay visible when this browser tab is not the
  // active one: the tab title is the only surface that survives tab switches.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (baseTitle.current === null) baseTitle.current = document.title;
    const busy =
      activeRun?.status === "queued" || activeRun?.status === "running";
    document.title = busy
      ? `● Investigating… · ${baseTitle.current}`
      : (baseTitle.current ?? document.title);
  }, [activeRun?.status]);

  const toggleSidebar = () => setSidebarCollapsed((current) => !current);

  return (
    <div className="rp-app-shell relative isolate h-dvh w-full overflow-hidden bg-surface" data-collapsed={sidebarCollapsed}>
      {/* Keyboard users shouldn't have to tab the whole sidebar every page. */}
      <a
        href="#main"
        className="sr-only rounded-field bg-ink-strong px-4 py-2 text-sm font-semibold text-surface focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-60"
      >
        Skip to content
      </a>

      {/* Static sidebar from lg up, scrolling independently of main */}
      <div
        className="rp-scrollbar rp-desktop-sidebar hidden h-full min-w-0 overflow-x-hidden overflow-y-auto border-r border-border bg-sidebar lg:block"
      >
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      </div>

      {/* Off-canvas drawer below lg */}
      {drawerOpen ? (
        <MobileDrawer onClose={() => setDrawerOpen(false)} />
      ) : null}

      <div data-shell-pane className="flex h-full min-h-0 min-w-0 flex-col">
        <header className="rp-glass-bar relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3.5 md:px-[22px]">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-field border border-border bg-subtle text-ink-2 transition-console hover:bg-[#e0ece5] lg:hidden"
          >
            <Menu aria-hidden size={18} strokeWidth={1.5} />
          </button>

          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-2">{isAgentWorkspace ? "Agent" : pageLabel(pathname)}</p>

          {/* Account and run status stay at the right edge of the header. */}
          <div className="flex shrink-0 items-center gap-2.5 sm:ml-auto">
            <RunIndicator />
            <UserMenu />
          </div>
        </header>

        {mode === "replay" ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-subtle px-4 py-2 text-[12px] text-muted md:px-[22px]">
            <DatabaseZap aria-hidden size={14} className="shrink-0" />
            <span><strong className="font-extrabold text-ink-2">Sample data</strong>{" · "}Findings in this workspace are illustrative.</span>
          </div>
        ) : null}

        <main
          id="main"
          tabIndex={-1}
          className={`rp-scrollbar min-w-0 flex-1 ${isAgentWorkspace ? "overflow-hidden p-0" : "overflow-y-auto p-4 md:p-[22px]"}`}
        >
          <ViewTransition key={pathname} enter="rp-route" exit="rp-route" default="none">
          <div
            key={pathname}
            className={`rp-route-page min-w-0 ${isAgentWorkspace ? "h-full" : "flex flex-col gap-4"}`}
          >
            {children}
          </div>
          </ViewTransition>
        </main>
      </div>

      {DEMO_CONTROLS_ENABLED ? <DebugPanel /> : null}
    </div>
  );
}
