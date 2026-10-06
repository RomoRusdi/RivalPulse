import { formatFinancial } from "./format";

export const PERFORMANCE_LABELS: Record<string, string> = {
  yoy_quarter_revenue_growth: "Revenue growth · quarterly YoY",
  yoy_quarter_earnings_growth: "Earnings growth · quarterly YoY",
  net_profit_margin: "Net profit margin · annual",
};

export function financialFigureText(figure: { value: string | null; currency: string | null; unit: string }) {
  if (figure.value === null) return "Conflicting source values";
  return formatFinancial(figure);
}

export function performancePeriod(metric: { period: string | null; periodKind: string }) {
  return metric.period ? (metric.periodKind === "annual" ? `FY${metric.period}` : metric.period) : "Quarter not supplied";
}

export function percentageText(value: string | null, signed = true) {
  if (value === null) return "Conflicting source values";
  return `${signed && Number(value) > 0 ? "+" : ""}${value}%`;
}

export function collectionMessage(code: string | null) {
  switch (code) {
    case "PROVIDER_AUTH_FAILED": return "The Sectors connection needs attention.";
    case "PROVIDER_ACCESS_DENIED": return "Sectors denied financial data access for this request.";
    case "PROVIDER_QUOTA_EXHAUSTED": return "The Sectors API credit allowance is exhausted.";
    case "CREDIT_BUDGET_EXCEEDED": return "The research credit or request budget was reached.";
    case "PROVIDER_RATE_LIMITED": return "Sectors limited the request rate. Retry research later.";
    case "PROVIDER_INVALID_RESPONSE": return "The latest response could not be verified.";
    default: return "The latest financial collection did not complete.";
  }
}
