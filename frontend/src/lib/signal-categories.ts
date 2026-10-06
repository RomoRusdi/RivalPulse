import type { SignalType } from "./types";

export const SIGNAL_CATEGORIES: { label: SignalType; color: string; wash: string }[] = [
  { label: "Pricing", color: "#146c50", wash: "#e6f3ec" },
  { label: "Product", color: "#087F78", wash: "#EAF7F4" },
  { label: "Partnership", color: "#6950A1", wash: "#F1EDFA" },
  { label: "Campaign", color: "#B13F67", wash: "#FCEEF3" },
];

export function categoryStyle(category: SignalType) {
  const entry = SIGNAL_CATEGORIES.find((item) => item.label === category)!;
  return { color: entry.color, backgroundColor: entry.wash };
}
