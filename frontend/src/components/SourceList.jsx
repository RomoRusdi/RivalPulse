import {
  ExternalLink,
  FileText,
} from "lucide-react";

function SourceList({ sources }) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <FileText
            size={15}
            className="text-zinc-400"
          />

          <div>
            <h3 className="text-sm font-semibold">
              Research Sources
            </h3>

            <p className="mt-1 text-xs text-zinc-600">
              Sources returned by the research data layer.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-800">
        {sources.map((source, index) => (
          <div
            key={`${source.ticker}-${index}`}
            className="flex items-start gap-3 p-4"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800">
              <FileText
                size={13}
                className="text-zinc-500"
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-500">
                  {source.ticker}
                </span>

                {source.source && (
                  <span className="text-[10px] text-zinc-700">
                    {source.source}
                  </span>
                )}
              </div>

              <p className="mt-1 text-xs text-zinc-400">
                {source.title}
              </p>

              {source.published_at && (
                <p className="mt-1 text-[10px] text-zinc-700">
                  {source.published_at}
                </p>
              )}
            </div>

            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-800 hover:text-zinc-300"
                title="Open source"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default SourceList;