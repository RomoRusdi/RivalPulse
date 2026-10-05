"use client";

import { Minus } from "lucide-react";
import { Card, CardHeader, Pill } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { compactFinancial } from "@/lib/format";

/**
 * Revenue comparison for every listed competitor: one row per company with
 * its latest cited figure and movement since its first cited period.
 * A shared line graph was misleading here — cited series differ in meaning
 * (revenue vs ARPU vs capex) and scale — so every figure stays in its own
 * row with its own basis, plus the rigorous side-by-side statement table
 * that ships with each investigation result.
 */
export function CompetitorMomentum() {
  const { watchlist, signals, loading } = useStore();
  const companies = watchlist?.companies ?? [];
  const ourCompany = watchlist?.user_company ?? null;

  const tracks = companies.map((company) => {
    const owned = signals.filter((item) => item.company === company.ticker);
    // Prefer a revenue-like series; fall back to the latest series available.
    const signal =
      owned.find((item) =>
        /revenue|arpu|segment|enterprise|capex|broadband/i.test(
          item.financialContext.seriesCaption,
        ),
      ) ?? owned[0];
    const series = signal?.financialContext.series ?? [];
    const values = series.map((point) => point.value);
    const first = values[0];
    const last = values[values.length - 1];
    const change =
      first !== undefined && first !== 0 && last !== undefined
        ? ((last - first) / Math.abs(first)) * 100
        : null;
    return {
      company,
      signalCount: owned.length,
      seriesLength: series.length,
      isOurs: ourCompany === company.ticker,
      caption: signal?.financialContext.seriesCaption ?? null,
      latestLabel: series[series.length - 1]?.label ?? null,
      latest: last,
      firstLabel: series[0]?.label ?? null,
      change,
    };
  });

  const comparable = tracks.filter(
    (t) => t.latest !== undefined && t.seriesLength > 0,
  );

  if (!comparable.length) {
    return (
      <Card className="min-w-0">
        <CardHeader
          title="Competitor revenue comparison"
          aside={<Pill tone="quiet">Table · as cited</Pill>}
          className="mb-1 flex flex-wrap items-center justify-between gap-3"
        />
        <p className="flex items-center gap-1.5 text-[13px] text-muted">
          <Minus aria-hidden size={13} />
          {loading
            ? "Loading financial context…"
            : signals.length === 0
              ? `Watchlist has ${companies.length} competitors but no stored signals yet — run an investigation first (e.g. “Compare competitor financial momentum”).`
              : "Stored signals have no comparable revenue series yet — need citable figures per competitor. Run a financial investigation first."}
        </p>
        {!loading ? (
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted">
            {tracks.map((t) => (
              <li key={t.company.ticker}>
                <span className="font-bold text-ink-2">{t.company.ticker}</span>
                {` · ${t.signalCount} signal${t.signalCount === 1 ? "" : "s"} · ${t.seriesLength} revenue point${t.seriesLength === 1 ? "" : "s"}`}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Competitor revenue comparison"
        aside={<Pill tone="quiet">Table · as cited</Pill>}
        className="mb-1 flex flex-wrap items-center justify-between gap-3"
      />
      <p className="max-w-[72ch] text-[13px] leading-[1.55] text-muted">
        Latest cited figure per competitor with movement since its first cited
        period. For the rigorous side-by-side annual table, open any completed
        investigation result.
      </p>

      <div className="mt-3 overflow-x-auto rounded-field border border-divider">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="bg-subtle/70 text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <th className="px-3.5 py-2.5 font-bold">Competitor</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Latest period</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Figure</th>
              <th className="px-3.5 py-2.5 text-right font-bold">Since first</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((t) => (
              <tr key={t.company.ticker} className="border-t border-divider">
                <td className="px-3.5 py-2.5">
                  <span className="font-extrabold">{t.company.ticker}</span>
                  {t.isOurs ? (
                    <span title="Your company"> ★</span>
                  ) : null}
                  <span className="block truncate text-xs text-muted">
                    {t.company.name}
                  </span>
                  {t.caption ? (
                    <span className="block truncate text-[11px] text-muted" title={t.caption}>
                      {t.caption}
                    </span>
                  ) : null}
                </td>
                <td
                  className="px-3.5 py-2.5 text-right text-muted"
                  title="No cited figures yet — run an investigation"
                >
                  {t.latestLabel ?? "—"}
                </td>
                <td
                  className="px-3.5 py-2.5 text-right font-bold tabular-nums"
                  title={t.latest !== undefined ? String(t.latest) : "No cited figures yet — run an investigation"}
                >
                  {t.latest !== undefined ? compactFinancial(String(t.latest)) : "—"}
                </td>
                <td className="px-3.5 py-2.5 text-right font-bold tabular-nums text-accent-ink">
                  {t.change !== null
                    ? `${t.change >= 0 ? "+" : ""}${t.change.toFixed(1)}%`
                    : <span title="Needs ≥2 cited revenue points" className="font-semibold text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Figures as cited in each signal&apos;s financial context; series differ
        in meaning and scale across companies, so cross-company ranking lives
        in the cited annual table of an investigation result, not here.
      </p>
    </Card>
  );
}
