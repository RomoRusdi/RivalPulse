import {
  Activity,
  ArrowUpRight,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const icons = {
  compare: TrendingUp,
  analyze: Search,
  signals: Activity,
  marketing: Sparkles,
};

function QuickPrompt({ type, title, description, onClick }) {
  const Icon = icons[type] || Sparkles;

  return (
    <button
      onClick={onClick}
      className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
          <Icon size={15} />
        </div>

        <ArrowUpRight
          size={15}
          className="text-zinc-700 transition group-hover:text-zinc-400"
        />
      </div>

      <p className="text-sm font-medium">{title}</p>

      <p className="mt-1 text-xs leading-5 text-zinc-600">
        {description}
      </p>
    </button>
  );
}

export default QuickPrompt;