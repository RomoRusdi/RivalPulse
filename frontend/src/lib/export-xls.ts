import type { AgentRun, Signal } from "./types";
import { BRIEF_KINDS, compactFinancial, figureUnitSuffix, prettyBriefKind } from "./format";

/** Escape for HTML-table based .xls (Excel opens it natively, no dependency). */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(cells: unknown[]): string {
  return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
}

const TITLE_STYLE = "background:#1F1E1C;color:#FFFFFF;font-weight:bold;font-size:12pt;";
const HEAD_STYLE = "background:#E8E4DC;font-weight:bold;";

function section(title: string, columns: string[], body: string[]): string {
  const head = columns.map((c) => `<td style="${HEAD_STYLE}">${esc(c)}</td>`).join("");
  return `<table border="1" cellpadding="4" style="border-collapse:collapse;">` +
    `<tr><td colspan="${Math.max(columns.length, 1)}" style="${TITLE_STYLE}">${esc(title)}</td></tr>` +
    `<tr>${head}</tr>${body.join("")}</table><br/>`;
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

/**
 * Export one completed chat research result to .xls.
 *
 * Everything below comes from this specific run: its prompt, its summary,
 * its comparison table and its signals with evidence. Nothing is templated
 * filler — an empty section means the run genuinely produced none.
 */
export function downloadRunXls(run: AgentRun, signals: Signal[]): void {
  const brief = run.financialBrief;
  // Findings belonging to this run; produced ids are the fallback for older
  // stored messages that predate run-id matching.
  const runSignals = signals.filter((s) => s.runId === run.id);
  const byId = new Map(signals.map((s) => [s.id, s]));
  const listed =
    runSignals.length > 0
      ? runSignals
      : (run.producedSignalIds ?? [])
          .map((id) => byId.get(id))
          .filter((s): s is Signal => Boolean(s));
  const companies = [...new Set(listed.map((s) => `${s.company} · ${s.companyName}`))];

  const sections: string[] = [];

  sections.push(section("Investigation", ["Field", "Detail"],
    [
      row(["Prompt", run.query]),
      row(["Exported at", new Date().toISOString()]),
      row(["Status", run.status + (run.coverageStatus ? ` / ${run.coverageStatus}` : "")]),
      row(["Summary", run.resultSummary ?? ""]),
      row(["Signals in this run", listed.length]),
      row(["Companies covered", companies.join("; ") || "—"]),
    ],
  ));

  if (brief) {
    const periods = [...new Set(
      brief.rows.flatMap((r) => r.metrics.map((m) => m.period)),
    )].sort().reverse();
    const kinds = BRIEF_KINDS.filter((kind) =>
      brief.rows.some((r) => r.metrics.some((m) => m.metric === kind)),
    );
    const columns = ["Metric · Period", ...brief.rows.map((r) => `${r.symbol} · ${r.name}`)];
    const body: string[] = [];
    for (const kind of kinds) {
      for (const period of periods) {
        body.push(row([
          `${prettyBriefKind(kind)} · ${period}`,
          ...brief.rows.map((r) => {
            const m = r.metrics.find((x) => x.metric === kind && x.period === period);
            if (!m) return "—";
            const suffix = figureUnitSuffix(m.currency, m.unit);
            return `${compactFinancial(m.value)}${suffix}`;
          }),
        ]));
      }
    }
    if (!body.length) body.push(row(["No comparable annual figures", ...brief.rows.map(() => "—")]));
    sections.push(section(
      "Side-by-side comparison" + (brief.period ? ` · ${brief.period}` : ""), columns, body,
    ));
    if (brief.interpretation) {
      sections.push(section(
        `AI hypothesis (uncertainty: ${brief.interpretation.uncertainty})`,
        ["Hypothesis"],
        [row([brief.interpretation.text])],
      ));
    }
    if (brief.caveats.length) {
      sections.push(section(
        "Caveats", ["Note"],
        brief.caveats.map((c) => row([c])),
      ));
    }
  }

  if (listed.length) {
    sections.push(section(
      `Signals (${listed.length})`,
      ["Company", "Type", "Severity", "Detected", "Title"],
      listed.map((s) => row([`${s.company} · ${s.companyName}`, s.type, s.severity, s.detectedAt, s.headline])),
    ));
  }

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
  a.download = `rivalpulse-${date}-${slug(run.query)}-${run.id.slice(0, 8)}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
