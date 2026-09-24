import {
  Building2,
  Globe2,
  Layers3,
  Tag,
} from "lucide-react";

function CompanySnapshot({ company }) {
  if (!company) {
    return null;
  }

  const items = [
    {
      icon: Building2,
      label: "Company",
      value: company.company_name,
    },
    {
      icon: Tag,
      label: "Ticker",
      value: company.ticker,
    },
    {
      icon: Layers3,
      label: "Industry",
      value: company.industry || company.sector || "—",
    },
    {
      icon: Globe2,
      label: "Country",
      value: company.country || "—",
    },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-5 py-4">
        <h3 className="text-sm font-semibold">
          Company Snapshot
        </h3>

        <p className="mt-1 text-xs text-zinc-600">
          Basic company information from the research data.
        </p>
      </div>

      <div className="grid gap-px bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="bg-zinc-900/80 p-4"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800">
                <Icon
                  size={15}
                  className="text-zinc-400"
                />
              </div>

              <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                {item.label}
              </p>

              <p className="mt-1 truncate text-sm font-medium text-zinc-200">
                {item.value}
              </p>
            </div>
          );
        })}
      </div>

      {company.description && (
        <div className="border-t border-zinc-800 px-5 py-4">
          <p className="text-xs leading-5 text-zinc-500">
            {company.description}
          </p>
        </div>
      )}
    </section>
  );
}

export default CompanySnapshot;