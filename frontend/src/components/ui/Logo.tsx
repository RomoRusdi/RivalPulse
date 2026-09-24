/**
 * The RivalPulse mark: a pulse trace in the accent square.
 *
 * Deliberately the same artwork as `src/app/icon.svg` (the favicon) — if you
 * change one, change the other, or the browser tab stops matching the app.
 *
 * The trace reads as a monitored signal spiking: the product in one glyph.
 */
export function Logo({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="RivalPulse"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#E2650F" />
      <path
        d="M5 16.5h4.2l2.6-6.8 4 13.4 3.1-9.3 1.9 2.7H27"
        fill="none"
        stroke="#FBFAF8"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
