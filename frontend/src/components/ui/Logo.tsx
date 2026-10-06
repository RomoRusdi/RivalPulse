/** The supplied PNG is preserved byte-for-byte; the SVG viewport omits its transparent margins. */
export function Logo({ size = 26, className, plain = false, wordmark = false }: { size?: number; className?: string; plain?: boolean; wordmark?: boolean }) {
  return <svg width={wordmark ? size * 5.06 : size} height={size} viewBox={wordmark ? "210 166 1770 350" : "210 166 336 350"} preserveAspectRatio="xMidYMid meet" role="img" aria-label="RivalPulse" className={className} data-plain={plain || undefined} style={{ flexShrink: 0 }}>
    <image href="/brand/rivalpulse.png" width="2172" height="724" />
  </svg>;
}
