"use client";

import { useState } from "react";
import { Menu, Plus } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { InvestigateDialog } from "./InvestigateDialog";
import { DebugPanel } from "./DebugPanel";
import { SearchField } from "./SearchField";
import { MobileDrawer } from "./MobileDrawer";
import { Button } from "@/components/ui/primitives";
import { USER } from "@/lib/mock-data";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [investigateOpen, setInvestigateOpen] = useState(false);

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
      <div className="hidden h-full w-[244px] shrink-0 overflow-y-auto lg:block">
        <Sidebar />
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

          <SearchField />

          {/* ml-auto pins the actions to the right edge. Without it they sit
              flush against the capped search field, leaving the bar looking
              unbalanced on a wide window. */}
          <div className="flex shrink-0 items-center gap-2.5 sm:ml-auto">
            <Button
              variant="primary"
              onClick={() => setInvestigateOpen(true)}
              className="min-h-11 lg:min-h-0"
            >
              <Plus aria-hidden size={16} strokeWidth={2} />
              Investigate
            </Button>
            {/* An empty grey circle reads as a broken image. */}
            <span
              aria-hidden
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[13px] font-bold text-ink-2 sm:flex"
            >
              {USER.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-[22px]"
        >
          {children}
        </main>
      </div>

      {investigateOpen ? (
        <InvestigateDialog onClose={() => setInvestigateOpen(false)} />
      ) : null}

      <DebugPanel />
    </div>
  );
}
