"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Trap Tab inside an overlay, close it on Escape, and return focus to whatever
 * opened it.
 *
 * Without this, tabbing out of a dialog lands on the page behind it: keyboard
 * and screen-reader users end up operating a UI they cannot see, and on close
 * their focus position is gone entirely.
 *
 * Mount this only while the overlay is open — the cleanup is what restores
 * focus.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  isolate = false,
) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first control, or the container itself if it holds none.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const first = focusables()[0];
    if (first) first.focus({ preventScroll: true });
    else container.focus({ preventScroll: true });
    const background = isolate ? Array.from(document.querySelectorAll<HTMLElement>("#main, header, nav")).filter((node) => !node.contains(container)) : [];
    const inertState = background.map((node) => node.inert);
    background.forEach((node) => { node.inert = true; });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === firstItem || !container.contains(active))) {
        event.preventDefault();
        lastItem.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      background.forEach((node, index) => { node.inert = inertState[index]; });
      // Only restore if focus is still inside (or lost to body) — never yank
      // it away from somewhere the user has since moved.
      const active = document.activeElement;
      if (!active || active === document.body || container.contains(active)) {
        previouslyFocused?.focus?.({ preventScroll: true });
      }
    };
  }, [ref, isolate]);
}
