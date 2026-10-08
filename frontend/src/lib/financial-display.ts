import { financialScale, formatFinancial, humanizeFigureMeta, type FinancialAmount } from "./format";

/** Decimal strings stay exact. BigInt is used only to round the display label. */
function decimal(value: string) {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim().replaceAll(",", ""));
  if (!match || !(match[2] || match[3]) || Math.abs(Number(match[4] ?? 0)) > 300 || value.length > 650) return null;
  const digits = ((match[2] || "0") + (match[3] || "")).replace(/^0+(?=\d)/, "");
  return { negative: match[1] === "-", coefficient: BigInt(digits), power: Number(match[4] || 0) - (match[3]?.length || 0), order: digits === "0" ? 0 : digits.length - 1 + Number(match[4] || 0) - (match[3]?.length || 0) };
}
function rounded(value: NonNullable<ReturnType<typeof decimal>>, shift: number) {
  const power = value.power + shift + 2;
  const divisor = BigInt(10) ** BigInt(Math.max(0, -power));
  const cents = power >= 0 ? value.coefficient * BigInt(10) ** BigInt(power) : (value.coefficient + divisor / BigInt(2)) / divisor;
  const whole = (cents / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value.negative && cents !== BigInt(0) ? "-" : ""}${whole}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}
const SCALES = [
  { power: 18, suffix: " quintillion", symbol: " quintillion" },
  { power: 15, suffix: " quadrillion", symbol: "Q" },
  { power: 12, suffix: " trillion", symbol: "T" },
  { power: 9, suffix: " billion", symbol: "B" },
  { power: 6, suffix: " million", symbol: "M" },
  { power: 3, suffix: " thousand", symbol: "K" },
];
export function financialDisplay(amount: FinancialAmount & { period?: string; metric?: string }) {
  const metadata = `${amount.currency ?? "Currency not supplied"} · ${humanizeFigureMeta(amount.unit) || "Scale not supplied"}`;
  if (amount.value === null) return { short: "Conflicting values", exact: "The saved report contains conflicting values for this figure.", status: "conflict", qualification: "Review report", metadata, period: amount.period };
  // A change below -100% can only mean a profit turned into a loss (growth is
  // computed only from a positive base). "-343.35%" reads as nonsense; say what
  // happened, and keep the exact figure one click away.
  if (amount.metric === "earnings_yoy_percent" && amount.unit === "percent") {
    const change = Number(amount.value.replace(/[%+,]/g, ""));
    if (Number.isFinite(change) && change <= -100) {
      const short = change < -100 ? "Swung to a loss" : "Fell to zero";
      return { short, exact: `${amount.value} year-on-year change in earnings`, status: "reported", qualification: "", metadata, period: amount.period };
    }
  }
  if (["percent", "ratio", "count", "shares", "times"].includes(amount.unit)) return { short: formatFinancial(amount), exact: formatFinancial(amount), status: "reported", qualification: "", metadata, period: amount.period };
  const number = decimal(amount.value);
  if (!number) return { short: "Not available", exact: amount.value, status: "invalid", qualification: "Value unverified", metadata, period: amount.period };
  const sourceScale = financialScale(amount.unit);
  // Sectors reports omit the currency, but IDX statements are in rupiah and the
  // figures are full amounts (BBCA FY2025 revenue 112006326000000 = Rp 112 T).
  // Show them the way a businessperson reads them. Below Rp 100 billion an
  // unlabelled number could be a US-dollar reporter (Medco, PGAS, Vale), so
  // those keep the neutral source-number display rather than a wrong "Rp".
  if (!amount.currency && amount.unit === "provider_native_unspecified" && number.order >= 11) {
    const big = SCALES.find((entry) => number.order >= entry.power)!;
    return { short: `Rp ${rounded(number, -big.power)} ${big.symbol.trim()}`,
      exact: `${amount.value} rupiah. Sectors does not state the currency; IDX statements are reported in rupiah.`,
      status: "inferred", qualification: "", metadata: "Rupiah (IDX reporting currency; not stated by Sectors)", period: amount.period };
  }
  const verified = Boolean(amount.currency && sourceScale !== null);
  const shift = verified ? Math.round(Math.log10(sourceScale!)) : 0;
  const scale = SCALES.find((scale) => number.order + shift >= scale.power);
  const value = rounded(number, shift - (scale?.power ?? 0));
  const currency = /^(IDR|Rp|rupiah)$/i.test(amount.currency ?? "") ? "Rp" : amount.currency;
  const extreme = number.order + shift > 21;
  const scientific = extreme ? `${rounded(number, -number.order)}e${number.order + shift}` : null;
  const short = verified ? `${currency} ${scientific ?? value}${extreme ? "" : scale?.symbol ?? ""}` : `${scale ? "≈" : ""}${scientific ?? value}${extreme ? "" : scale?.suffix ?? ""} · source number`;
  const missing = !amount.currency && sourceScale === null ? "Currency/scale missing" : !amount.currency ? "Currency missing" : "Scale missing";
  return { short, exact: `${amount.value} · ${metadata}`, status: verified ? "verified" : "unverified", qualification: verified ? "" : missing, metadata: verified ? metadata : `${metadata}. This is the source number, not a verified monetary amount.`, period: amount.period };
}

const METRIC_LABELS: Record<string, string> = {
  revenue: "Revenue", earnings: "Earnings", total_assets: "Total assets",
  total_equity: "Total equity", ebitda: "EBITDA",
};
/** The backend's stored fact sentence: "revenue for 2019: 25132628000000 currency unspecified (provider_native_unspecified)." */
const STORED_FACT = /^([a-z_]+)\s+for\s+(\d{4})\s*:\s*(\S+)\s+(currency unspecified|[A-Za-z]{3})\s*\(([^)]*)\)\.?$/i;

/**
 * Business-readable form of a stored financial fact, e.g.
 * "Revenue (FY2019): ≈25.13 trillion reported units". The stored text is the
 * citation record and stays unchanged; only its display is rewritten. Anything
 * that is not a recognised fact sentence passes through untouched.
 */
export function readableFact(text: string): string {
  const match = STORED_FACT.exec(text.trim());
  if (!match || !(match[1].toLowerCase() in METRIC_LABELS)) return humanizeFigureMeta(text);
  const [, metric, period, value, currency, unit] = match;
  const shown = financialDisplay({ value, unit, currency: /unspecified/i.test(currency) ? null : currency }).short;
  return `${METRIC_LABELS[metric.toLowerCase()]} (FY${period}): ${shown}`;
}
