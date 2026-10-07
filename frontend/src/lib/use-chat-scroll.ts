"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { reducedMotion } from "./motion";

/** One interruptible spring follows measured content, never wheel/touch/key intent. */
export function useChatScroll(sessionId: string | null, signature: string) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const frame = useRef(0);
  const velocity = useRef(0);
  const position = useRef(0);
  const lastTime = useRef(0);
  const target = useRef(0);
  const previousSession = useRef<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const stop = () => { cancelAnimationFrame(frame.current); frame.current = 0; velocity.current = 0; };
  const schedule = () => {
    const element = viewport.current;
    if (!element || !following.current) return;
    target.current = Math.max(0, element.scrollHeight - element.clientHeight);
    if (reducedMotion()) { stop(); element.scrollTop = target.current; return; }
    if (frame.current) return;
    position.current = element.scrollTop;
    lastTime.current = performance.now();
    const tick = (time: number) => {
      if (!following.current || !viewport.current) { stop(); return; }
      const scroll = viewport.current;
      const dt = Math.min(.032, (time - lastTime.current) / 1000);
      lastTime.current = time;
      // Integrate in floating point; scrollTop can be pixel-quantized at the
      // device scale and must not keep a subpixel spring running indefinitely.
      const distance = target.current - position.current;
      velocity.current += (256 * distance - 32 * velocity.current) * dt;
      if (Math.abs(distance) < .75 && Math.abs(velocity.current) < 3) { scroll.scrollTop = target.current; stop(); return; }
      position.current = Math.max(0, Math.min(target.current, position.current + velocity.current * dt));
      scroll.scrollTop = position.current;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (previousSession.current !== sessionId) {
      stop(); following.current = true; previousSession.current = sessionId;
      element.scrollTop = sessionId ? element.scrollHeight : 0;
    } else schedule();
    // Content observation also catches charts and composer growth between updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, signature]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const interrupt = () => { following.current = false; stop(); setShowJump(element.scrollHeight - element.clientHeight > 2); };
    const wheel = (event: WheelEvent) => { if (event.deltaY < 0) interrupt(); };
    const key = (event: KeyboardEvent) => { if (["ArrowUp", "PageUp", "Home"].includes(event.key)) interrupt(); };
    let touchY = 0;
    const touchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const touchMove = (event: TouchEvent) => { if ((event.touches[0]?.clientY ?? touchY) > touchY + 3) interrupt(); };
    const pointer = (event: PointerEvent) => { if (event.offsetX >= element.clientWidth - 10) interrupt(); };
    element.addEventListener("wheel", wheel, { passive: true });
    element.addEventListener("keydown", key);
    element.addEventListener("touchstart", touchStart, { passive: true });
    element.addEventListener("touchmove", touchMove, { passive: true });
    element.addEventListener("pointerdown", pointer);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    if (content.current) observer.observe(content.current);
    return () => {
      observer.disconnect(); stop();
      element.removeEventListener("wheel", wheel); element.removeEventListener("keydown", key);
      element.removeEventListener("touchstart", touchStart); element.removeEventListener("touchmove", touchMove); element.removeEventListener("pointerdown", pointer);
    };
    // The refs retain the same viewport/content nodes throughout a conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScroll = () => {
    const element = viewport.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 2;
    if (!frame.current && atBottom) following.current = true;
    setShowJump(!following.current && !atBottom);
    setScrolled(element.scrollTop > 8);
  };
  const jump = () => { following.current = true; setShowJump(false); viewport.current?.focus({ preventScroll: true }); schedule(); };
  const resume = () => { following.current = true; setShowJump(false); };
  return { viewport, content, resume, showJump, scrolled, onScroll, jump };
}
