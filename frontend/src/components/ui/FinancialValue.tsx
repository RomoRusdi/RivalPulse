import { financialDisplay } from "@/lib/financial-display";
import type { FinancialAmount } from "@/lib/format";

/** Native disclosure keeps exact figures available to keyboard and touch users. */
export function FinancialValue({ amount, showPeriod = false }: { amount?: FinancialAmount & { period?: string; metric?: string; alternatives?: FinancialAmount[] }; showPeriod?: boolean }) {
  if (!amount) return <span className="text-xs font-normal text-muted">Not reported</span>;
  const display = financialDisplay(amount);
  return <div className="min-w-0">
    <details className="rp-financial-value text-ink">
      <summary className="cursor-pointer rounded text-sm font-bold tabular-nums underline decoration-divider underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent" aria-label={`${display.short}. Show exact reported value`}>{display.short}</summary>
      <p className="mt-2 inline-block max-w-[38ch] break-words text-left text-xs font-normal leading-relaxed text-muted">Exact reported value: {display.exact}</p>
      {amount.alternatives?.map((entry, index) => <p key={index} className="mt-1 break-words text-xs font-normal text-muted">Reported entry {index + 1}: {financialDisplay(entry).exact}</p>)}
    </details>
    {display.qualification ? <span className="mt-1 inline-block rounded bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-muted-strong">{display.qualification}</span> : null}
    {showPeriod && amount.period ? <p className="mt-1 text-xs font-normal text-muted">FY{amount.period}</p> : null}
  </div>;
}
