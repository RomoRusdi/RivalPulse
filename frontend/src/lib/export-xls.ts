import type { AgentRun, Signal } from "./types";
import { prettyBriefKind } from "./format";
import { financialDisplay } from "./financial-display";
import { sectorGroups } from "./sector-groups";

/** Escape for HTML-table based .xls (Excel opens it natively, no dependency). */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A cell: text by default; numbers carry an Excel number format so they sort and chart. */
type Cell = string | number | null | undefined | { number: number; format: string } | { text: string; style: string };
const NUMBER = (value: number | null, format = "0.00"): Cell => (value === null || !Number.isFinite(value) ? "–" : { number: value, format });

function cell(value: Cell, extra = ""): string {
  if (value && typeof value === "object" && "number" in value) {
    return `<td style="mso-number-format:'${value.format}';text-align:right;${extra}">${value.number.toFixed(2)}</td>`;
  }
  if (value && typeof value === "object" && "text" in value) return `<td style="${value.style}${extra}">${esc(value.text)}</td>`;
  return `<td style="vertical-align:top;${extra}">${esc(value ?? "")}</td>`;
}

function row(cells: Cell[], extra = ""): string {
  return `<tr>${cells.map((value) => cell(value, extra)).join("")}</tr>`;
}

const TITLE_STYLE = "background:#122d23;color:#FFFFFF;font-weight:bold;font-size:12pt;";
const HEAD_STYLE = "background:#E8E4DC;font-weight:bold;vertical-align:bottom;";
const OURS = "background:#EAF4EE;font-weight:bold;";
const NOTE = "color:#5b6b63;font-style:italic;";

function section(title: string, columns: string[], body: string[], footnote?: string): string {
  const head = columns.map((c) => `<td style="${HEAD_STYLE}">${esc(c)}</td>`).join("");
  const span = Math.max(columns.length, 1);
  return `<table border="1" cellpadding="5" style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:10pt;">` +
    `<tr><td colspan="${span}" style="${TITLE_STYLE}">${esc(title)}</td></tr>` +
    (columns.length ? `<tr>${head}</tr>` : "") + body.join("") +
    (footnote ? `<tr><td colspan="${span}" style="${NOTE}">${esc(footnote)}</td></tr>` : "") +
    `</table><br/>`;
}

function slug(text: string): string {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
  return clean || "investigation";
}

/** The perspective prefix is framing added by the app, not what the user asked. */
export function askedQuestion(query: string): string {
  return query.replace(/^Our company is [^.]+\. Compare relative to our position\.\s*/i, "").trim() || query;
}

const readableDate = (value: Date) => value.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type Amount = { value: string | null; currency: string | null; unit: string };
/** Full-rupiah amounts as Rp trillion numbers; anything not clearly rupiah stays readable text. */
function trillions(metric?: Amount): Cell {
  if (!metric || metric.value === null) return "–";
  const display = financialDisplay(metric);
  const rupiah = display.status === "inferred" || (/^(IDR|Rp)$/i.test(metric.currency ?? "") && metric.unit === "units");
  const value = Number(metric.value);
  return rupiah && Number.isFinite(value) ? NUMBER(value / 1e12) : display.short;
}

const SCOPE_LABEL: Record<string, string> = {
  competitor_move: "Competitor move",
  unverified_context: "Context only · not a competitor move",
  financial_context: "Financial context",
  third_party_commentary: "Analyst commentary",
};
const METRIC_NAME: Record<string, string> = { revenue: "Revenue", earnings: "Net profit", total_assets: "Total assets", total_equity: "Total equity", ebitda: "EBITDA" };
const PROFIT_LABEL: Record<string, string> = { profit: "Profit", loss: "Loss", swung_to_loss: "Swung to a loss", break_even: "Break-even" };

/**
 * Export one completed chat research result to .xls.
 *
 * Everything below comes from this specific run: its question, its answer,
 * its comparison and its findings. Amounts are real Excel numbers (Rp
 * trillion) so they sort and chart; exact source digits are kept as text.
 */
export function downloadRunXls(run: AgentRun, signals: Signal[]): void {
  const brief = run.financialBrief;
  // Findings belonging to this run; produced ids are the fallback for older
  // stored messages that predate run-id matching.
  const runSignals = run.findings?.length ? run.findings : signals.filter((s) => s.runId === run.id);
  const byId = new Map(signals.map((s) => [s.id, s]));
  const listed =
    runSignals.length > 0
      ? runSignals
      : (run.producedSignalIds ?? [])
          .map((id) => byId.get(id))
          .filter((s): s is Signal => Boolean(s));
  const origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
  const perspective = run.comparison?.perspective ?? null;
  const sections: string[] = [];

  sections.push(section("RivalPulse investigation", [], [
    row([{ text: "Question", style: "font-weight:bold;width:140px;" }, askedQuestion(run.query)]),
    ...(perspective ? [row([{ text: "Your company", style: "font-weight:bold;" }, perspective])] : []),
    row([{ text: "Exported", style: "font-weight:bold;" }, readableDate(new Date())]),
    row([{ text: "Result", style: "font-weight:bold;" }, run.coverageStatus === "partial" ? "Complete, with some coverage gaps" : run.status === "complete" ? "Complete" : run.status]),
    row([{ text: "Answer", style: "font-weight:bold;" }, run.resultSummary ?? ""]),
    row([{ text: "Findings", style: "font-weight:bold;" }, listed.length ? `${listed.length} in this run` : "None in this run"]),
  ]));

  // Every note in one place at the end, without repeating the same sentence per row.
  const notes = new Set<string>();

  if (run.comparison) {
    const comparison = run.comparison;
    const rows = new Map((brief?.rows ?? []).map((item) => [item.symbol, item]));
    const metric = (symbol: string, name: string) => rows.get(symbol)?.metrics.find((m) => m.metric === name && m.period === comparison.period);
    const rank = (position: number | null, size: number) => position === null ? "–" : `${position} of ${size}`;
    const percent = (value: string | null) => NUMBER(value === null ? null : Number(value.replace(/[%+]/g, "")));
    sections.push(section(`Comparison${comparison.period ? ` · FY${comparison.period}` : ""}`,
      ["Company", "Sector", "Revenue (Rp trillion)", "Net profit (Rp trillion)", "Net margin (%)", "Margin rank", "Revenue growth (%)", "Growth rank", "Result", "Findings in this run"],
      comparison.entries.map((entry) => {
        const ours = entry.symbol === comparison.perspective;
        entry.notes.forEach((note) => notes.add(`${entry.symbol}: ${note}`));
        return row([
          ours ? `★ ${entry.symbol} (your company)` : entry.symbol, entry.industry,
          trillions(metric(entry.symbol, "revenue")), trillions(metric(entry.symbol, "earnings")),
          percent(entry.net_margin_percent), rank(entry.margin_rank, entry.margin_rank_size),
          percent(entry.revenue_growth_percent), rank(entry.growth_rank, entry.growth_rank_size),
          entry.profit ? PROFIT_LABEL[entry.profit] ?? entry.profit : "–", entry.findings,
        ], ours ? OURS : "");
      }),
      "Ranks compare companies in the same sector only. – means not available or not comparable; see Notes below."));
    comparison.notes.forEach((note) => notes.add(note));
  }

  if (brief) {
    const sectors = sectorGroups(brief.rows, (company) => company.industry || run.comparison?.entries.find((entry) => entry.symbol === company.symbol)?.industry, (company) => company.symbol);
    if (sectors.length > 1) notes.add("Companies are grouped by sector. Bank revenue and telecom revenue are different business measures, so each sector has its own table.");
    for (const group of sectors) {
      const history = group.items.map((company) => {
        const byYear = new Map<string, Amount>();
        for (const metric of [...company.revenue_history, ...company.metrics]) if (metric.metric === "revenue") byYear.set(metric.period, metric);
        return { company, byYear };
      });
      const years = [...new Set(history.flatMap((item) => [...item.byYear.keys()]))].sort();
      if (!years.length) continue;
      sections.push(section(`${group.label} · revenue by year (Rp trillion)`, ["Company", ...years.map((year) => `FY${year}`)],
        history.map(({ company, byYear }) => row([
          company.symbol === perspective ? `★ ${company.symbol} · ${company.name}` : `${company.symbol} · ${company.name}`,
          ...years.map((year) => trillions(byYear.get(year))),
        ], company.symbol === perspective ? OURS : "")),
        "Sectors annual company reports. A jump between years can reflect a merger or a change in what is reported."));
    }
    // Excel would round long decimal strings beyond 15 significant digits, so
    // the exact source values stay text.
    const exact = brief.rows.flatMap((company) => {
      const metrics = [...new Map([...company.metrics, ...company.revenue_history].map((metric) =>
        [JSON.stringify([metric.metric, metric.period, metric.value]), metric])).values()]
        .filter((metric) => metric.unit !== "percent")
        .sort((a, b) => a.metric.localeCompare(b.metric) || a.period.localeCompare(b.period));
      return metrics.map((metric) => `<tr>${[company.symbol, METRIC_NAME[metric.metric] ?? prettyBriefKind(metric.metric), `FY${metric.period}`, metric.value ?? "Conflicting values",
        metric.currency ?? "IDR (not stated by source)"]
        .map((value) => `<td style="mso-number-format:'\\@';">${esc(value)}</td>`).join("")}</tr>`);
    });
    if (exact.length) sections.push(section("Exact source figures", ["Company", "Metric", "Year", "Exact value as reported", "Currency"], exact,
      "Full amounts exactly as Sectors reports them. Sectors does not state a currency; IDX statements are reported in rupiah."));
    if (brief.interpretation) {
      sections.push(section(`AI reading of the figures (uncertainty: ${brief.interpretation.uncertainty})`, [], [row([brief.interpretation.text])]));
    }
    brief.caveats.forEach((note) => notes.add(note));
  }

  if (listed.length) {
    sections.push(section(`Findings (${listed.length})`,
      ["Company", "Category", "Kind", "Headline", "What happened", "Why it matters", "Possible implication", "Viewed from", "Recommended next step", "What remains unknown", "Open in RivalPulse"],
      listed.map((s) => {
        const d = s.decisionSupport;
        return row([
          `${s.company} · ${s.companyName}`, s.type, SCOPE_LABEL[s.findingScope ?? ""] ?? "Not recorded", s.headline,
          d?.what_happened ?? s.evidence.find((item) => item.kind === "observed_signal")?.text ?? "",
          d?.why_it_matters ?? "No structured explanation was saved for this older finding.",
          d ? d.potential_implication ?? "Not enough evidence yet to say how this affects your company." : "–",
          d ? `${d.perspective ?? "Neutral"} · ${d.origin === "ai" ? `AI inference, ${d.uncertainty} uncertainty` : "rule-based"}` : "–",
          d?.recommended_next_step ?? "", d?.limitations.join("; ") ?? "",
          `${origin}/signals/${s.id}`,
        ]);
      })));
  }

  if (notes.size) sections.push(section("Notes and limitations", [], [...notes].map((note) => row([`• ${note}`]))));

  const html = [
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>`,
    ...sections,
    `</body></html>`,
  ].join("");

  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rivalpulse-${date}-${slug(askedQuestion(run.query))}-${run.id.slice(0, 8)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
