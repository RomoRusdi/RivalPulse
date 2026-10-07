"use client";
import { useAnimatedNumber } from "@/lib/motion";
export function AnimatedNumber({ value, suffix = "", roll = false, precision = 0 }: { value: number; suffix?: string; roll?: boolean; precision?: number }) {
  const number = useAnimatedNumber(value, precision);
  return <span className="inline-grid min-w-[2ch] tabular-nums"><span key={roll ? value : "count"} className={roll ? "rp-number-roll" : undefined} aria-hidden>{number}{suffix}</span><span className="sr-only">{value}{suffix}</span></span>;
}
