"use client";

import { useCallback, useRef, useState } from "react";
import { Sidebar } from "./Sidebar";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cx } from "@/components/ui/primitives";

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
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useFocusTrap(panelRef, requestClose);

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
          "rp-drawer h-full w-[260px] max-w-[85vw] border-r border-border shadow-frame",
          closing && "rp-drawer-out",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Sidebar onNavigate={requestClose} />
      </div>
    </div>
  );
}
