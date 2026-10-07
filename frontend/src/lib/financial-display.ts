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
export function financialDisplay(amount: FinancialAmount & { period?: string }) {
  const metadata = `${amount.currency ?? "Currency not supplied"} · ${humanizeFigureMeta(amount.unit) || "Scale not supplied"}`;
  if (amount.value === null) return { short: "Conflicting values", exact: "The saved report contains conflicting values for this figure.", status: "conflict", qualification: "Review report", metadata, period: amount.period };
  if (["percent", "ratio", "count", "shares", "times"].includes(amount.unit)) return { short: formatFinancial(amount), exact: formatFinancial(amount), status: "reported", qualification: "", metadata, period: amount.period };
  const number = decimal(amount.value);
  if (!number) return { short: "Not available", exact: amount.value, status: "invalid", qualification: "Value unverified", metadata, period: amount.period };
  const sourceScale = financialScale(amount.unit);
  const verified = Boolean(amount.currency && sourceScale !== null);
  const shift = verified ? Math.round(Math.log10(sourceScale!)) : 0;
  const scale = SCALES.find((scale) => number.order + shift >= scale.power);
  const value = rounded(number, shift - (scale?.power ?? 0));
  const currency = /^(IDR|Rp|rupiah)$/i.test(amount.currency ?? "") ? "Rp" : amount.currency;
  const extreme = number.order + shift > 21;
  const scientific = extreme ? `${rounded(number, -number.order)}e${number.order + shift}` : null;
  const short = verified ? `${currency} ${scientific ?? value}${extreme ? "" : scale?.symbol ?? ""}` : `${scale ? "≈" : ""}${scientific ?? value}${extreme ? "" : scale?.suffix ?? ""} reported units`;
  return { short, exact: `${amount.value} · ${metadata}`, status: verified ? "verified" : "unverified", qualification: verified ? "" : "Unit unverified", metadata, period: amount.period };
}
