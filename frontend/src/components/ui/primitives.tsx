import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Route } from "next";
import type { EvidenceKind, Severity } from "@/lib/types";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Card ──────────────────────────────────────────────────────────────── */

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"section">) {
  return (
    <section
      className={cx(
        "rp-card min-w-0 rounded-card border border-border bg-card p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[17px] font-bold">{children}</h2>;
}

export function CardHeader({
  title,
  aside,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3",
        className ?? "mb-4",
      )}
    >
      <CardTitle>{title}</CardTitle>
      {aside}
    </div>
  );
}

/* ── Pills ─────────────────────────────────────────────────────────────── */

type PillTone = "neutral" | "accent" | "quiet";

export function Pill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<PillTone, string> = {
    neutral: "bg-subtle text-ink-2",
    accent: "bg-accent-wash text-accent-ink",
    quiet: "bg-subtle text-muted",
  };
  return (
    <span
      className={cx(
        "inline-block shrink-0 rounded-full px-3 py-[5px] text-xs font-bold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Severity is impact on positioning, not stock price — copy says so in the UI.
 *
 * Medium and Low previously differed only in text colour, so at a glance the
 * scale read as "High / not High". They now differ in weight and border too,
 * which separates them without adding a hue this restrained palette doesn't
 * have.
 */
export function SeverityPill({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    high: "bg-accent-wash text-accent-ink",
    medium: "border border-neutral-300 bg-subtle text-ink-2",
    low: "border border-transparent bg-subtle font-semibold text-muted",
  };
  const label: Record<Severity, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  return (
    <span
      className={cx(
        "inline-block shrink-0 rounded-full px-3 py-[5px] text-xs font-bold",
        styles[severity],
      )}
    >
      {label[severity]}
    </span>
  );
}

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  fact: "Fact",
  observed_signal: "Observed signal",
  hypothesis: "AI hypothesis · not verified",
};

/* ── Buttons ───────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "neutral" | "dark";

// `active:scale-[0.98]` is deliberately near-imperceptible: buttons are pressed
// dozens of times a day, and anything more legible would start to feel slow.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-field transition-console cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white font-bold hover:bg-accent-hover",
  neutral: "bg-subtle text-ink-2 font-semibold hover:bg-[#e0ece5]",
  dark: "bg-ink-strong text-surface font-semibold hover:bg-[#284b39]",
};

export function Button({
  variant = "neutral",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        size === "sm"
          ? "px-3 py-1.5 text-[13px] rounded-[9px]"
          : "px-4 py-[9px] text-sm",
        className,
      )}
      {...rest}
    />
  );
}

export function ButtonLink({
  href,
  variant = "neutral",
  className,
  children,
}: {
  href: Route;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        "px-4 py-[9px] text-sm no-underline",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/* ── Text bits ─────────────────────────────────────────────────────────── */

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "text-[11px] font-bold uppercase tracking-[0.1em]",
        className ?? "text-muted",
      )}
    >
      {children}
    </p>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{children}</h1>
  );
}

export function Disclaimer() {
  return (
    <p className="text-xs text-muted-strong">
      Information and analysis only. Not investment advice.
    </p>
  );
}

/* ── Loading & empty ───────────────────────────────────────────────────── */

/** Skeletons match the real block dimensions so nothing shifts on load. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

/**
 * An inline data failure. Names what is missing and states plainly that
 * nothing stale was shown in its place — the handoff is explicit that cached
 * values must never silently stand in for fresh ones.
 */
export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-card border border-accent-wash-border bg-accent-wash p-5"
    >
      <Eyebrow className="text-accent-ink">Data unavailable</Eyebrow>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-[1.55]">{message}</p>
      <p className="mt-1.5 text-[13px] text-muted">
        Try again to check for updated information.
      </p>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-detail border border-dashed border-border bg-subtle/60 p-6">
      <p className="text-[15px] font-bold leading-[1.35]">{title}</p>
      <p className="max-w-[46ch] text-sm leading-[1.55] text-muted">{body}</p>
      {action}
    </div>
  );
}
