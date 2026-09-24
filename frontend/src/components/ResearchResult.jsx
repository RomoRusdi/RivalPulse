import {
  BarChart3,
  Clock3,
} from "lucide-react";

import CompanySnapshot from "./CompanySnapshot";
import FinancialContext from "./FinancialContext";
import CompetitorComparison from "./CompetitorComparison";
import SignalList from "./SignalList";
import MarketingImplications from "./MarketingImplications";
import SourceList from "./SourceList";

function ResearchResult({ result }) {
  if (!result) {
    return null;
  }

  return (
    <div className="mt-5 space-y-4">

      {/* Header */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">

        <div className="flex items-start justify-between gap-4">

          <div className="flex items-start gap-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
              <BarChart3
                size={17}
                className="text-zinc-300"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">
                  Research Result
                </h3>

                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[9px] font-medium text-zinc-600">
                  {result.company}
                </span>
              </div>

              {result.competitors?.length > 0 && (
                <p className="mt-1 text-xs text-zinc-600">
                  Compared against{" "}
                  {result.competitors.join(", ")}
                </p>
              )}
            </div>

          </div>

          {result.execution_metadata?.duration_ms && (
            <div className="hidden items-center gap-1.5 text-[10px] text-zinc-700 sm:flex">
              <Clock3 size={12} />

              {formatDuration(
                result.execution_metadata.duration_ms
              )}
            </div>
          )}

        </div>

        {/* Summary */}
        {result.summary && (
          <div className="mt-5 border-t border-zinc-800 pt-5">
            <p className="text-sm leading-6 text-zinc-400">
              {result.summary}
            </p>
          </div>
        )}

      </div>

      <CompanySnapshot
        company={result.company_snapshot}
      />

      <FinancialContext
        financial={result.financial_context}
      />

      <CompetitorComparison
        comparisons={result.competitor_comparison}
      />

      <SignalList
        signals={result.signals}
      />

      <MarketingImplications
        implications={result.marketing_implications}
      />

      <SourceList
        sources={result.sources}
      />

      {/* Execution metadata */}
      {result.execution_metadata && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-[10px] text-zinc-700">
          <span>
            {result.execution_metadata.tool_calls ?? 0} tool calls
          </span>

          <span>
            {result.execution_metadata.signals_detected ?? 0} signals
          </span>

          {result.execution_metadata.duration_ms && (
            <span>
              {formatDuration(
                result.execution_metadata.duration_ms
              )}
            </span>
          )}
        </div>
      )}

    </div>
  );
}

function formatDuration(milliseconds) {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
}

export default ResearchResult;