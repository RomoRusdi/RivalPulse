import { ArrowUpRight } from "lucide-react";

function SuggestedQuestions({ suggestions, onSelect }) {
  if (!suggestions?.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="group rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-500 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <span className="flex items-center gap-2">
            {suggestion}

            <ArrowUpRight
              size={12}
              className="opacity-40 transition group-hover:opacity-100"
            />
          </span>
        </button>
      ))}
    </div>
  );
}

export default SuggestedQuestions;