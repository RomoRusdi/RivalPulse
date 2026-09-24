import { ArrowDown, ArrowUp, Minus, Scale } from "lucide-react";

function CompetitorComparison({ comparisons }) {
  if (!comparisons || comparisons.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
            <Scale size={15} className="text-zinc-400" />
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              Competitor Comparison
            </h3>

            <p className="mt-1 text-xs text-zinc-600">
              Differences between the target company and competitors.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Company
              </th>

              <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Competitor
              </th>

              <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Revenue Growth
              </th>

              <th className="px-5 py-3 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                Net Income
              </th>
            </tr>
          </thead>

          <tbody>
            {comparisons.map((comparison, index) => (
              <tr
                key={`${comparison.company}-${comparison.competitor}-${index}`}
                className="border-b border-zinc-800/70 last:border-0"
              >
                <td className="px-5 py-4">
                  <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-semibold">
                    {comparison.company}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <span className="text-sm text-zinc-400">
                    {comparison.competitor}
                  </span>
                </td>

                <td className="px-5 py-4">
                  <Difference
                    value={
                      comparison.revenue_growth_difference_pct
                    }
                  />
                </td>

                <td className="px-5 py-4">
                  <Difference
                    value={
                      comparison.net_income_growth_difference_pct
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Difference({ value }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Minus size={13} />
        —
      </div>
    );
  }

  const numericValue = Number(value);

  const Icon =
    numericValue > 0
      ? ArrowUp
      : numericValue < 0
        ? ArrowDown
        : Minus;

  return (
    <div className="flex items-center gap-2">
      <Icon
        size={13}
        className="text-zinc-400"
      />

      <span className="text-sm font-medium">
        {numericValue > 0 ? "+" : ""}
        {numericValue.toFixed(2)} pp
      </span>
    </div>
  );
}

export default CompetitorComparison;