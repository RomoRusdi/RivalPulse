import {
  ArrowUpRight,
  Lightbulb,
} from "lucide-react";

function MarketingImplications({ implications }) {
  if (!implications || implications.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
            <Lightbulb
              size={15}
              className="text-zinc-400"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              Marketing Implications
            </h3>

            <p className="mt-1 text-xs text-zinc-600">
              Potential marketing considerations derived from detected
              signals.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4">
        {implications.map((implication, index) => (
          <div
            key={`${implication.title}-${index}`}
            className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                <ArrowUpRight
                  size={15}
                  className="text-zinc-400"
                />
              </div>

              <div>
                <h4 className="text-sm font-medium">
                  {implication.title}
                </h4>

                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {implication.description}
                </p>

                {implication.supporting_signals?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {implication.supporting_signals.map(
                      (signal) => (
                        <span
                          key={signal}
                          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[9px] text-zinc-600"
                        >
                          {signal}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default MarketingImplications;