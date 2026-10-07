"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cx } from "@/components/ui/primitives";
import { reducedMotion } from "@/lib/motion";

/** Must match `.rp-drawer-out` in globals.css. */
const EXIT_MS = 220;

/**
 * The off-canvas navigation below 1024px.
 *
 * A separate component so it mounts only while open — the focus trap's cleanup
 * is what returns focus to the menu button, and that only works if the whole
 * thing unmounts on close.
 *
 * Closing runs the slide-out first and unmounts after, so the panel leaves the
 * way it arrived instead of vanishing.
 */
export function MobileDrawer({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  // Capture before the navigation trap moves focus into the drawer.
  useEffect(() => { opener.current = document.activeElement as HTMLElement | null; }, []);

  const requestClose = useCallback(() => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, reducedMotion() ? 0 : EXIT_MS);
  }, [onClose]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  useFocusTrap(panelRef, () => {
    // Escape closes a nested Agent menu before dismissing navigation.
    if (!panelRef.current?.querySelector('[role="menu"][data-open="true"]')) requestClose();
  });

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const dismissHiddenDrawer = () => {
      if (!desktop.matches) return;
      // CSS hides this dialog at the desktop breakpoint. Unmount its trap too,
      // and return keyboard users to visible content instead of a hidden opener.
      const active = document.activeElement;
      if (active === document.body || panelRef.current?.contains(active)) {
        document.getElementById("main")?.focus({ preventScroll: true });
      }
      onClose();
    };
    dismissHiddenDrawer();
    desktop.addEventListener("change", dismissHiddenDrawer);
    return () => desktop.removeEventListener("change", dismissHiddenDrawer);
  }, [onClose]);

  return (
    <div
      className={cx(
        "rp-fade fixed inset-0 z-50 bg-ink/35 lg:hidden",
        closing && "rp-fade-out",
      )}
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className={cx(
          "rp-drawer rp-scrollbar h-full w-[260px] max-w-[85vw] overflow-y-auto overscroll-contain border-r border-border shadow-frame",
          closing && "rp-drawer-out",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Sidebar onNavigate={requestClose} onAgentAction={() => {
          requestClose();
          // History records this persistent button as its focus return target.
          opener.current?.focus({ preventScroll: true });
        }} />
      </div>
    </div>
  );
}
