import {
  Banknote,
  CalendarDays,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

function FinancialContext({ financial }) {
  if (!financial) {
    return null;
  }

  const revenueGrowth = financial.revenue_growth_pct;
  const incomeGrowth = financial.net_income_growth_pct;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">
              Financial Context
            </h3>

            <p className="mt-1 text-xs text-zinc-600">
              Available normalized financial data.
            </p>
          </div>

          {financial.period && (
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-500">
              <CalendarDays size={12} />
              {financial.period}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <MetricCard
          label="Revenue"
          value={formatNumber(
            financial.revenue,
            financial.currency
          )}
          icon={Banknote}
        />

        <MetricCard
          label="Revenue Growth"
          value={formatPercentage(revenueGrowth)}
          icon={getTrendIcon(revenueGrowth)}
          negative={revenueGrowth < 0}
        />

        <MetricCard
          label="Net Income"
          value={formatNumber(
            financial.net_income,
            financial.currency
          )}
          icon={Banknote}
        />

        <MetricCard
          label="Net Income Growth"
          value={formatPercentage(incomeGrowth)}
          icon={getTrendIcon(incomeGrowth)}
          negative={incomeGrowth < 0}
        />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  negative = false,
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-zinc-600">
          {label}
        </p>

        <Icon
          size={15}
          className={
            negative
              ? "text-zinc-500"
              : "text-zinc-600"
          }
        />
      </div>

      <p className="mt-2 text-lg font-semibold tracking-tight text-zinc-200">
        {value}
      </p>
    </div>
  );
}

function formatPercentage(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  const prefix = value > 0 ? "+" : "";

  return `${prefix}${Number(value).toFixed(1)}%`;
}

function formatNumber(value, currency) {
  if (value === null || value === undefined) {
    return "—";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return "—";
  }

  if (number >= 1_000_000_000_000) {
    return `${currency || ""} ${(number / 1_000_000_000_000).toFixed(2)}T`;
  }

  if (number >= 1_000_000_000) {
    return `${currency || ""} ${(number / 1_000_000_000).toFixed(2)}B`;
  }

  if (number >= 1_000_000) {
    return `${currency || ""} ${(number / 1_000_000).toFixed(2)}M`;
  }

  return `${currency || ""} ${number.toLocaleString()}`;
}

function getTrendIcon(value) {
  if (value !== null && value !== undefined && value < 0) {
    return TrendingDown;
  }

  return TrendingUp;
}

export default FinancialContext;