import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const modules = new Map();
function load(name) {
  const file = path.resolve(testDirectory, "../src/lib", `${name}.ts`);
  if (modules.has(file)) return modules.get(file);
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", "module", output)(compiledModule.exports, (dependency) => load(dependency.replace(/^\.\//, "")), compiledModule);
  modules.set(file, compiledModule.exports);
  return compiledModule.exports;
}
const { formatFinancial, formatIDR, toIDR, evidenceHref } = load("format");
const { revenueSeries } = load("revenue-series");
const { promptSuggestions } = load("prompt-suggestions");
const { routeMessage } = load("agent-router");
const { financialDisplay } = load("financial-display");
const { downloadRunXls } = load("export-xls");
const amount = (value, unit = "units", currency = "IDR") => ({ value, currency, unit });
const point = (period, value, extra = {}) => ({ ...amount(value), period, basis: "consolidated", sourceUrl: "https://example.com/report", ...extra });

test("compact financial labels preserve exact decimal strings and verified scales", () => {
  const original = "112006326000000.0000123456789";
  const display = financialDisplay({ ...amount(original), period: "2025" });
  assert.equal(display.short, "Rp 112.01T");
  assert.ok(display.exact.startsWith(original));
  assert.equal(display.period, "2025");
  assert.equal(display.status, "verified");
  assert.equal(financialDisplay(amount("112006326", "millions")).short, "Rp 112.01T");
  assert.equal(financialDisplay(amount("-4426618000000")).short, "Rp -4.43T");
  assert.equal(financialDisplay(amount("0")).short, "Rp 0.00");
  assert.equal(financialDisplay(amount("1.005")).short, "Rp 1.01");
  assert.equal(financialDisplay(amount("-0.0001")).short, "Rp 0.00");
});
test("unverified financial labels do not invent a currency or apply an unknown scale", () => {
  const display = financialDisplay(amount("112006326000000", "provider_native_unspecified", null));
  assert.equal(display.short, "≈112.01 trillion reported units");
  assert.equal(display.qualification, "Unit unverified");
  assert.equal(financialDisplay(amount("1200", "provider_native_unspecified")).short, "≈1.20 thousand reported units");
  assert.equal(financialDisplay(amount("1200", "millions", null)).short, "≈1.20 thousand reported units");
  assert.equal(financialDisplay(amount("1200", "units", "USD")).short, "USD 1.20K");
});
test("compact values handle conflicts, huge decimals, invalid input and rates distinctly", () => {
  assert.equal(financialDisplay(amount(null)).status, "conflict");
  assert.equal(financialDisplay(amount("1e100")).short, "Rp 1.00e100");
  for (const value of ["NaN", "Infinity", "1e999", "not a number"]) {
    assert.equal(financialDisplay(amount(value)).status, "invalid");
  }
  assert.equal(financialDisplay(amount("-12.50", "percent", null)).short, "-12.50%");
});
test("saved evidence links reject old API endpoints and credential query strings", () => {
  assert.equal(evidenceHref("https://api.sectors.app/v2/company/report/TLKM?key=private"), null);
  assert.equal(evidenceHref("https://example.com/report.pdf?token=private#page=1"), "https://example.com/report.pdf");
  assert.equal(evidenceHref("https://user:private@example.com/report"), null);
  assert.equal(evidenceHref("/financial-sources/12345678-1234-1234-1234-123456789012"), "/financial-sources/12345678-1234-1234-1234-123456789012");
  assert.equal(evidenceHref("//malicious.example"), null);
});
test("financial exports retain exact decimals as Excel text and omit provider diagnostics", async () => {
  const previous = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout };
  let blob, clicked = false;
  try {
    globalThis.document = { createElement: () => ({ click: () => { clicked = true; }, remove: () => {} }), body: { appendChild: () => {} } };
    URL.createObjectURL = (value) => { blob = value; return "blob:synthetic"; };
    URL.revokeObjectURL = () => {};
    globalThis.setTimeout = (callback) => { callback(); return 0; };
    downloadRunXls({ id: "synthetic-run", query: "Synthetic report", status: "complete", financialBrief: {period:"2025", caveats:[], rows:[{
      symbol:"TEST", name:"Synthetic company", metrics:[{metric:"revenue",period:"2025",value:"112006326000000.0000123456789", currency:"IDR",unit:"units",comparison_basis:"consolidated",
        source_url:"https://api.sectors.app/v2/report?key=never-export",json_pointer:"/financials/private"}], revenue_history:[]}] } }, []);
    const text = await blob.text();
    assert.ok(clicked);
    assert.ok(text.includes("Rp 112.01T"));
    assert.ok(text.includes("112006326000000.0000123456789"));
    assert.ok(text.includes("mso-number-format:'\\@'"));
    assert.ok(!/api\.sectors|never-export|json_pointer|\/financials\/private/.test(text));
  } finally {
    globalThis.document = previous.document;
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
    globalThis.setTimeout = previous.timeout;
  }
});

test("all verified source scales produce identical IDR formatting", () => {
  for (const [value, unit] of [["10751850000000000", "units"], ["10751850000", "millions"], ["10751850", "billions"], ["10751.85", "trillions"]]) {
    assert.equal(formatFinancial(amount(value, unit)), "IDR 10,751.85T");
  }
  assert.equal(formatIDR(-1.25e12), "IDR -1.25T");
  assert.equal(formatFinancial(amount("0")), "IDR 0.00T");
});
test("unknown scale, missing currency and other currencies cannot become IDR", () => {
  for (const entry of [amount("1200", "provider_native_unspecified"), amount("1200", "units", null), amount("1200", "millions", "USD"), amount("1200", ""), amount("not a number"), amount("1e999")]) {
    assert.equal(toIDR(entry), null);
    assert.ok(!formatFinancial(entry).startsWith("IDR "));
  }
  assert.equal(formatFinancial(amount(null)), "Conflicting source values");
});
test("percentages, ratios and counts retain their units", () => {
  assert.equal(formatFinancial(amount("+20.00%", "percent", null)), "+20.00%");
  assert.equal(formatFinancial(amount("-12.5", "percent", null)), "-12.50%");
  assert.equal(formatFinancial(amount("1.5", "ratio", null)), "1.5 ratio");
  assert.equal(formatFinancial(amount("25", "count", null)), "25 count");
});
test("annual growth normalizes verified scales before comparing", () => {
  const data = revenueSeries({ company: "TEST", points: [point("2024", "1000", { unit: "billions" }), point("2025", "1200000", { unit: "millions" })] });
  assert.equal(data.points[0].rupiah, 1e12);
  assert.equal(data.points[1].rupiah, 1.2e12);
  assert.ok(Math.abs(data.points[1].change - 20) < 1e-10);
});
test("gaps, scope changes, missing metadata and nonpositive bases prevent growth", () => {
  for (const entries of [[point("2023", "100"), point("2025", "120")], [point("2024", "100"), point("2025", "120", { basis: "standalone" })], [point("2024", "0"), point("2025", "120")], [point("2024", "100"), point("2025", "120", { currency: "USD" })], [point("2024", "100"), point("2025", "120", { limitation: "Scope changed" })]]) {
    assert.equal(revenueSeries({ company: "TEST", points: entries }).points[1].change, null);
  }
  const merger = revenueSeries({ company: "TEST", note: "2025 merger changed scope", points: [point("2024", "100"), point("2025", "120")] });
  assert.equal(merger.points[1].change, null);
});
test("conflicts and incompatible reporting periods are withheld", () => {
  const data = revenueSeries({ company: "TEST", points: [point("2024", "100"), point("2024", "101"), point("2025", "120"), point("Q1 2025", "30")] });
  assert.equal(data.points.length, 2);
  assert.equal(data.points[0].rupiah, null);
  assert.equal(data.points[1].change, null);
  assert.equal(data.excluded, 3);
});
test("suggestions use watched companies and the most recent relevant finding", () => {
  const watchlist = { companies: [{ ticker: "BBCA" }, { ticker: "BBRI" }] };
  const suggestions = promptSuggestions(watchlist, [{ company: "TLKM", detectedAt: "2026-10-06", type: "Product", headline: "Unrelated" }, { company: "BBCA", detectedAt: "2026-10-05", type: "Partnership", headline: "BBCA signs a distribution partnership" }]);
  assert.match(suggestions[0].query, /BBCA signs a distribution partnership/);
  assert.match(suggestions[1].query, /BBCA and BBRI/);
  assert.ok(!JSON.stringify(suggestions).includes("TLKM"));
  assert.equal(promptSuggestions(null, [])[0].title, "Build your watchlist");
});
test("generated research suggestions pass the company router without false matches", () => {
  for (const tickers of [["TLKM", "EXCL", "ISAT"], ["BBCA", "BBRI"], ["GOTO", "BUKA"]]) {
    const watchlist = { name: "Test", companies: tickers.map((ticker) => ({ ticker })) };
    for (const suggestion of promptSuggestions(watchlist, [])) {
      const route = routeMessage(suggestion.query, watchlist);
      assert.equal(route.kind, "research", suggestion.query);
      assert.ok(route.companies.every((company) => tickers.includes(company.ticker)));
    }
  }
});
