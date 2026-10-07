"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function motionDuration(token: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000) || 150;
}

/** CSS transitions retain their computed pose on reversals; only unmount after exit. */
export function useReversiblePresence() {
  const [state, setState] = useState({ open: false, present: false });
  const setOpen = useCallback((update: SetStateAction<boolean>) => setState((current) => {
    const open = typeof update === "function" ? update(current.open) : update;
    return { open, present: current.present || open };
  }), []);
  useEffect(() => {
    if (state.open || !state.present) return;
    const timer = window.setTimeout(() => setState((current) => current.open ? current : { open: false, present: false }), motionDuration("--motion-exit") + 32);
    return () => window.clearTimeout(timer);
  }, [state.open, state.present]);
  return { ...state, setOpen };
}

/** Count updates start at the currently painted value; no stale queued counters. */
export function useAnimatedNumber(value: number, precision = 0) {
  const [painted, setPainted] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const start = current.current, started = performance.now();
    const duration = reducedMotion() ? 0 : motionDuration("--motion-response-smooth");
    let frame: number;
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - started) / duration) : 1;
      const eased = t === 1 ? 1 : 1 - (1 + 6.6 * t) * Math.exp(-6.6 * t);
      current.current = start + (value - start) * eased;
      const scale = 10 ** precision;
      setPainted(t === 1 ? value : Math.round(current.current * scale) / scale);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, precision]);
  return painted;
}

const flips = new WeakMap<Element, Animation>();
export function capturePositions(elements: Element[]) {
  return elements.map((element) => ({ element, rect: element.getBoundingClientRect() }));
}
/** One read/write/read batch per interaction. Only compositor transforms animate. */
export function playPositions(before: ReturnType<typeof capturePositions>) {
  before.forEach(({ element }) => flips.get(element)?.cancel());
  const positions = before.map(({ element, rect }) => ({ element, rect, next: element.getBoundingClientRect() }));
  for (const { element, rect, next } of positions) {
    if (!element.isConnected || !(element instanceof HTMLElement || element instanceof SVGElement) || reducedMotion()) continue;
    const x = rect.x - next.x, y = rect.y - next.y;
    const scale = element.hasAttribute("data-sidebar-surface") && next.width > 0 ? rect.width / next.width : 1;
    if (Math.abs(x) + Math.abs(y) < .5 && Math.abs(scale - 1) < .001) continue;
    element.style.willChange = "transform";
    const animation = element.animate([{ transform: `translate(${x}px, ${y}px) scaleX(${scale})` }, { transform: "translate(0, 0) scaleX(1)" }], {
      duration: motionDuration("--motion-response-smooth"), easing: getComputedStyle(document.documentElement).getPropertyValue("--spring-smooth").trim(),
    });
    flips.set(element, animation);
    const release = () => { if (flips.get(element) === animation) { element.style.removeProperty("will-change"); flips.delete(element); } };
    animation.onfinish = release; animation.oncancel = release;
  }
}
