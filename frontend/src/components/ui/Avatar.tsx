import { cx } from "./primitives";

/** "Rizky Pratama" -> "RP". Falls back to one letter, then to a dash. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const SIZES = {
  sm: "h-8 w-8 text-[13px]",
  md: "h-9 w-9 text-[13px]",
  lg: "h-16 w-16 text-xl",
  xl: "h-20 w-20 text-2xl",
} as const;

/**
 * Initials avatar.
 *
 * There are no uploaded images in this product, and a featureless grey circle
 * reads as a broken one — so the person's initials stand in.
 */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-neutral-200 font-bold text-ink-2",
        SIZES[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
