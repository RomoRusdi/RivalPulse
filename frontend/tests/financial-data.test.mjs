import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const modules = new Map();
function load(name) {
  const file = path.resolve(testDirectory, "../src/lib", `${name}.ts`);
  if (modules.has(file)) return modules.get(file);
  const compiledModule = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("exports", "require", "module", output)(compiledModule.exports, (dependency) => dependency.startsWith("./") ? load(dependency.slice(2)) : require(dependency), compiledModule);
  modules.set(file, compiledModule.exports);
  return compiledModule.exports;
}
const { formatFinancial, formatIDR, toIDR, evidenceHref } = load("format");
const { revenueSeries } = load("revenue-series");
const { promptSuggestions } = load("prompt-suggestions");
const { routeMessage } = load("agent-router");
const { COMPANY_CATALOGUE, COMPANY_ALIASES, findCompanies, suggestCompanies, missedTickers } = load("catalogue");
const { financialDisplay } = load("financial-display");
const { downloadRunXls } = load("export-xls");
const { AgentRunSchema, ComparisonSchema, SignalSchema, DecisionSupportSchema } = load("schemas");
const { sectorGroups } = load("sector-groups");
const { SIGNAL_CATEGORIES } = load("signal-categories");
const comparison = {
  period: "2025", perspective: "TEST", sector: "Banking", headline: "Synthetic comparison",
  entries: [{ symbol: "TEST", name: "Synthetic company", industry: "Banking", revenue_growth_percent: "+12.00",
    net_margin_percent: "0.00", net_margin_origin: "provider_reported", growth_note: "Calculated annual growth",
    margin_note: "Reported annual margin; scope unverified, context only", profit: "break_even", growth_rank: 1, margin_rank: null,
    growth_rank_size: 2, margin_rank_size: 0, peer_group: true, peer_group_size: 3,
    findings: 0, activity_note: "Recent activity not investigated", claim_ids: ["synthetic-claim"],
    notes: ["Other peer evidence is unavailable"] }], notes: ["Annual ratios are not an overall competitive score"],
};
const amount = (value, unit = "units", currency = "IDR") => ({ value, currency, unit });
const point = (period, value, extra = {}) => ({ ...amount(value), period, basis: "consolidated", sourceUrl: "https://example.com/report", ...extra });

const decisionSupport = {
  schema_version: 1, status: "limited", origin: "ai", fallback_reason: null,
  perspective: "ALFA", objective: "Synthetic pricing comparison", relevance: "same_sector",
  what_happened: "SYNTHETIC DATA: BETA advertises a student bundle.",
  why_it_matters: "BETA may overlap with ALFA if both offers target the same customers.",
  potential_implication: null, recommended_next_step: "Check advertised price, inclusions and eligibility after confirming overlap.",
  limitations: ["Customer overlap and financial impact remain unverified."],
  supporting_claim_ids: ["observation-0"], evidence_ids: ["synthetic-evidence"], uncertainty: "high",
};
const syntheticSignal = {
  id: "synthetic-finding", company: "BETA", companyName: "Synthetic rival", type: "Pricing",
  title: "Synthetic offer", subline: "replay · baseline · complete", headline: "Synthetic offer",
  severity: "low", detectedAt: "2026-09-20", runId: "original-synthetic-run", storedAt: "2026-09-20",
  comparedAgainstRunId: "", evidence: [{kind: "observed_signal", source: "Synthetic fixture", text: decisionSupport.what_happened}],
  financialContext: {seriesCaption: "Synthetic", series: [], metrics: [], whyItMatters: "Old unstructured text"},
};

test("financial and analyst context are valid categories, not forced into Product", () => {
  for (const type of ["Financial update", "Analyst commentary", "Market context"]) {
    const parsed = SignalSchema.parse({...syntheticSignal, type, findingScope: type === "Financial update" ? "financial_context" : "third_party_commentary",
      classificationNote: "Context only, not a competitor move", classificationRevised: true, originalType: "Product"});
    assert.equal(parsed.type, type);
    assert.equal(parsed.originalType, "Product");
    assert.equal(parsed.classificationRevised, true);
    assert.ok(SIGNAL_CATEGORIES.some((category) => category.label === type));
  }
});

test("sector grouping separates banks, telcos and unverified companies without implying comparability", () => {
  const companies = [{symbol: "BANK", industry: "Banking"}, {symbol: "TELA", industry: "Telecommunication"},
    {symbol: "TELB", industry: "Telecommunications"}, {symbol: "UNKA"}, {symbol: "UNKB"}];
  const groups = sectorGroups(companies, (company) => company.industry, (company) => company.symbol);
  assert.deepEqual(groups.map((group) => group.items.map((company) => company.symbol)), [["BANK"], ["TELA", "TELB"], ["UNKA"], ["UNKB"]]);
  assert.match(groups[2].label, /unverified/);
});

test("mixed-sector annual exports never put bank and telco revenue in the same comparison table", async () => {
  const previous = {document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout};
  let blob;
  try {
    globalThis.document = {createElement: () => ({click() {}, remove() {}}), body: {appendChild() {}}};
    URL.createObjectURL = (value) => {blob = value; return "blob:synthetic";};
    URL.revokeObjectURL = () => {};
    globalThis.setTimeout = (callback) => {callback(); return 0;};
    const rows = [["BANK", "Banking"], ["TELC", "Telecommunication"]].map(([symbol, industry]) => ({symbol, industry, name: `Synthetic ${symbol}`, revenue_history: [],
      metrics: [{metric: "revenue", period: "2025", value: "100", currency: "IDR", unit: "units", comparison_basis: "consolidated"}]}));
    downloadRunXls({id: "synthetic-sectors", query: "Synthetic grouped annual context", status: "complete", financialBrief: {period: "2025", rows, caveats: []}}, []);
    const text = await blob.text();
    const tables = text.match(/<table[\s\S]*?<\/table>/g);
    const banking = tables.find((table) => table.includes("Banking · revenue by year"));
    const telco = tables.find((table) => table.includes("Telecommunication · revenue by year"));
    assert.ok(banking.includes("BANK") && !banking.includes("TELC"));
    assert.ok(telco.includes("TELC") && !telco.includes("BANK"));
    assert.ok(text.includes("different business measures"));
  } finally {
    globalThis.document = previous.document;
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
    globalThis.setTimeout = previous.timeout;
  }
});

test("structured decision support preserves provenance, limitations and unavailable implications", () => {
  assert.deepEqual(DecisionSupportSchema.parse(decisionSupport), decisionSupport);
  const unavailable = DecisionSupportSchema.parse({...decisionSupport, origin: "rule_based", status: "unavailable", fallback_reason: "wording_rejected"});
  assert.equal(unavailable.potential_implication, null);
  assert.equal(unavailable.fallback_reason, "wording_rejected");
  assert.equal(SignalSchema.parse(syntheticSignal).decisionSupport, undefined);
  assert.equal(SignalSchema.parse({...syntheticSignal, decisionSupport: null}).decisionSupport, null);
  assert.deepEqual(SignalSchema.parse({...syntheticSignal, decisionSupport}).decisionSupport, decisionSupport);
});

test("run findings retain their frozen perspective instead of a mutable global signal view", () => {
  const run = AgentRunSchema.parse({id: "current-synthetic-run", query: "Synthetic context", status: "complete", currentStep: 0,
    steps: [], elapsedSeconds: 1, etaSeconds: 0, toolCalls: [], findings: [{...syntheticSignal, changeStatus: "unchanged", decisionSupport}]});
  assert.equal(run.findings[0].decisionSupport.perspective, "ALFA");
  assert.equal(run.findings[0].runId, "original-synthetic-run");
  assert.equal(run.findings[0].changeStatus, "unchanged");
});

test("decision-support exports use per-run findings and escape inference text", async () => {
  const previous = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout };
  let blob;
  try {
    globalThis.document = {createElement: () => ({click() {}, remove() {}}), body: {appendChild() {}}};
    URL.createObjectURL = (value) => {blob = value; return "blob:synthetic";};
    URL.revokeObjectURL = () => {};
    globalThis.setTimeout = (callback) => {callback(); return 0;};
    downloadRunXls({id: "current-synthetic-run", query: "Synthetic context", status: "complete", findings: [{...syntheticSignal,
      decisionSupport: {...decisionSupport, potential_implication: "Conditional <em>inference</em> only."}}]}, [{...syntheticSignal, decisionSupport: {...decisionSupport, perspective: "WRONG"}}]);
    const text = await blob.text();
    assert.ok(text.includes("Findings (1)") && text.includes("Viewed from"));
    assert.ok(text.includes("ALFA") && !text.includes("WRONG"));
    assert.ok(text.includes("Conditional &lt;em&gt;inference&lt;/em&gt; only."));
    assert.ok(text.includes("Customer overlap and financial impact remain unverified."));
    assert.ok(text.includes("synthetic-evidence") === false);
  } finally {
    globalThis.document = previous.document;
    URL.createObjectURL = previous.create;
    URL.revokeObjectURL = previous.revoke;
    globalThis.setTimeout = previous.timeout;
  }
});

test("comparison schemas retain gaps, rank denominators and zero earnings", () => {
  const parsed = ComparisonSchema.parse(comparison);
  assert.equal(parsed.entries[0].profit, "break_even");
  assert.equal(parsed.entries[0].growth_rank_size, 2);
  assert.equal(parsed.entries[0].net_margin_percent, "0.00");
  assert.equal(parsed.entries[0].net_margin_origin, "provider_reported");
  assert.match(parsed.entries[0].margin_note, /scope unverified/);
  const gap = ComparisonSchema.parse({ ...comparison, period: null, entries: [{ ...comparison.entries[0],
    net_margin_percent: null, growth_rank: null, revenue_growth_percent: null }] });
  assert.equal(gap.period, null);
  assert.equal(gap.entries[0].revenue_growth_percent, null);
  const oldRun = { id: "old", query: "Archived run", status: "complete", currentStep: 0,
    steps: [], elapsedSeconds: 1, etaSeconds: 0, toolCalls: [] };
  assert.equal(AgentRunSchema.parse(oldRun).comparison, undefined);
  assert.deepEqual(AgentRunSchema.parse({ ...oldRun, comparison }).comparison, parsed);
});

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
test("Sectors full amounts read as rupiah; small unlabelled numbers are never called rupiah", () => {
  const display = financialDisplay(amount("112006326000000", "provider_native_unspecified", null));
  assert.equal(display.short, "Rp 112.01 T");
  assert.equal(display.qualification, "");
  assert.match(display.exact, /^112006326000000 rupiah\. Sectors does not state the currency/);
  assert.equal(financialDisplay(amount("-4426618000000", "provider_native_unspecified", null)).short, "Rp -4.43 T");
  // A US-dollar reporter's figure (e.g. 3.9 billion) stays a neutral source number.
  const dollars = financialDisplay(amount("3900000000", "provider_native_unspecified", null));
  assert.equal(dollars.short, "≈3.90 billion · source number");
  assert.equal(dollars.qualification, "Currency/scale missing");
  assert.equal(financialDisplay(amount("1200", "provider_native_unspecified")).short, "≈1.20 thousand · source number");
  assert.equal(financialDisplay(amount("1200", "millions", null)).short, "≈1.20 thousand · source number");
  assert.equal(financialDisplay(amount("1200", "millions", null)).qualification, "Currency missing");
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
    downloadRunXls({ id: "synthetic-run", query: "Synthetic report", status: "complete", comparison, financialBrief: {period:"2025", caveats:[], rows:[{
      symbol:"TEST", name:"Synthetic company", metrics:[{metric:"revenue",period:"2025",value:"112006326000000.0000123456789", currency:"IDR",unit:"units",comparison_basis:"consolidated",
        source_url:"https://api.sectors.app/v2/report?key=never-export",json_pointer:"/financials/private"}], revenue_history:[]}] } }, []);
    const text = await blob.text();
    assert.ok(clicked);
    assert.ok(text.includes("Comparison · FY2025"));
    assert.ok(text.includes("★ TEST (your company)"));
    assert.ok(text.includes(">1 of 2<"));
    // Amounts are real Excel numbers in Rp trillion so they sort and chart.
    assert.ok(text.includes("mso-number-format:'0.00';text-align:right;") && text.includes(">112.01<"));
    assert.ok(text.includes("Notes and limitations") && text.includes("Other peer evidence is unavailable"));
    assert.ok(!text.includes("synthetic-claim"));
    assert.ok(text.includes("Exact source figures"));
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
test("ordinary financial language never becomes a company-name typo", () => {
  for (const text of [
    "Compare our company’s annual revenue growth and net margin with all my competitors. Show our position, supporting evidence, and any comparison limitations.",
    "Compare net margin and market share across my competitors.",
    "Bandingkan margin laba perusahaan kami dengan semua kompetitor.",
  ]) {
    assert.deepEqual(findCompanies(text), [], text);
    assert.deepEqual(suggestCompanies(text), [], text);
    const watchlist = { name: "Banks", user_company: "BBCA", companies: COMPANY_CATALOGUE.filter(c => ["BBRI", "BMRI"].includes(c.ticker)) };
    const route = routeMessage(text, watchlist);
    assert.equal(route.kind, "research", JSON.stringify(route));
    assert.deepEqual(route.companies, [], "Let the backend resolve saved watchlist scope, not an invented company");
  }
});

test("our saved company is a valid research target even outside watchlist membership", () => {
  const watchlist = { name: "Banks", user_company: "BBCA", companies: COMPANY_CATALOGUE.filter(c => ["BBRI", "BMRI"].includes(c.ticker)) };
  const route = routeMessage("Compare BBCA and BBRI annual revenue growth and net margin", watchlist);
  assert.equal(route.kind, "research", JSON.stringify(route));
  assert.deepEqual(route.companies.map(c => c.ticker), ["BBCA", "BBRI"]);
  const outside = routeMessage("Compare JSMR and BBRI annual revenue", watchlist);
  assert.equal(outside.kind, "instant");
  assert.equal(outside.label, "Not in your watchlist");
});

test("genuine company typos still require confirmation without spending", () => {
  const watchlist = { name: "Banks", companies: COMPANY_CATALOGUE.filter(c => ["BBRI", "BMRI"].includes(c.ticker)) };
  for (const text of ["Compare brbi and Mandiri", "Compare jasa margga with my competitors"]) {
    const route = routeMessage(text, watchlist);
    assert.equal(route.kind, "instant", text);
    assert.equal(route.label, "Possible match", text);
    assert.ok(route.suggestions.length > 0);
  }
  assert.ok(suggestCompanies("Research jasa margga").some(fix => fix.company.ticker === "JSMR"));
  assert.deepEqual(findCompanies("Compare Jasa Marga and BBRI").map(c => c.ticker), ["JSMR", "BBRI"]);
  assert.equal(routeMessage("compare", watchlist).kind, "instant");
  assert.equal(routeMessage("BBRI", watchlist).kind, "instant");
  assert.equal(routeMessage("Compare our company with all my competitors", watchlist).kind, "instant");
});

test("generated research suggestions pass the company router without false matches", () => {
  for (const tickers of [["TLKM", "EXCL", "ISAT"], ["BBCA", "BBRI"], ["GOTO", "BUKA"]]) {
    const watchlist = { name: "Test", companies: tickers.map((ticker) => ({ ticker })) };
    for (const suggestion of promptSuggestions(watchlist, [])) {
      const route = routeMessage(suggestion.query, watchlist);
      const saved = /stored findings/i.test(suggestion.query);
      assert.equal(route.kind, saved ? "chat" : "research", suggestion.query);
      if (!saved) assert.ok(route.companies.every((company) => tickers.includes(company.ticker)));
    }
  }
});

test("stored financial fact sentences become business-readable", () => {
  const { readableFact } = load("financial-display");
  assert.equal(
    readableFact("revenue for 2019: 25132628000000 currency unspecified (provider_native_unspecified)."),
    "Revenue (FY2019): Rp 25.13 T",
  );
  assert.equal(readableFact("earnings for 2025: -4426618000000 currency unspecified (provider_native_unspecified)."),
    "Earnings (FY2025): Rp -4.43 T");
  // Anything else passes through, with only provider tokens translated.
  assert.equal(readableFact("Calculated revenue growth: 12.5%."), "Calculated revenue growth: 12.5%.");
});

test("an earnings change below -100% reads as a swing to a loss", () => {
  const { financialDisplay } = load("financial-display");
  const swing = financialDisplay({ metric: "earnings_yoy_percent", value: "-343.35%", currency: null, unit: "percent" });
  assert.equal(swing.short, "Swung to a loss");
  assert.match(swing.exact, /-343\.35%/);
  assert.equal(financialDisplay({ metric: "earnings_yoy_percent", value: "-100.00%", currency: null, unit: "percent" }).short, "Fell to zero");
  // Ordinary declines and revenue changes keep their percentage.
  assert.equal(financialDisplay({ metric: "earnings_yoy_percent", value: "-24.67%", currency: null, unit: "percent" }).short, "-24.67%");
  assert.equal(financialDisplay({ metric: "revenue_yoy_percent", value: "-343.35%", currency: null, unit: "percent" }).short, "-343.35%");
});

test("natural company questions route to research in English and Indonesian", () => {
  const watchlist = { name: "Banks", user_company: null, companies: COMPANY_CATALOGUE.filter((c) => ["BBCA", "BMRI", "BBRI", "BBNI"].includes(c.ticker)) };
  const research = {
    "What did BBCA and BMRI ship in the last 30 days?": ["BBCA", "BMRI"],
    "How is BBRI doing?": ["BBRI"],
    "Is BBCA better than BMRI?": ["BBCA", "BMRI"],
    "What has BBCA been up to lately?": ["BBCA"],
    "What should I watch out for from BMRI?": ["BMRI"],
    "What are BBCA's plans for 2026?": ["BBCA"],
    "BBCA NPL ratio": ["BBCA"],
    "Dividen BBCA berapa?": ["BBCA"],
    "Lebih bagus BBCA atau BMRI?": ["BBCA", "BMRI"],
    "BBCA lagi ngapain?": ["BBCA"],
    "Who is leading among my competitors?": [],
    "Kompetitor saya ngapain aja minggu ini?": [],
    "Has anything changed since last week?": [],
  };
  for (const [text, tickers] of Object.entries(research)) {
    const route = routeMessage(text, watchlist);
    assert.equal(route.kind, "research", text);
    assert.deepEqual(route.companies.map((c) => c.ticker), tickers, text);
  }
});

test("routing still refuses to spend on bare tickers, advice, lookups and commands", () => {
  const watchlist = { name: "Banks", user_company: null, companies: COMPANY_CATALOGUE.filter((c) => ["BBCA", "BMRI"].includes(c.ticker)) };
  const bare = routeMessage("BBCA BMRI", watchlist);
  assert.equal(bare.kind, "instant");
  assert.ok(bare.suggestions.some((s) => s.prompt.includes("BBCA and BMRI")), "suggestions keep every named company");
  assert.ok(routeMessage("comapre BBCA and BMRI", watchlist).suggestions.some((s) => s.prompt === "compare BBCA and BMRI"));
  assert.equal(routeMessage("Is it a good time to buy BBCA?", watchlist).label, "No investment advice");
  assert.equal(routeMessage("What does BMRI stand for?", watchlist).kind, "chat");
  assert.equal(routeMessage("What is NIM?", watchlist).kind, "chat");
  assert.equal(routeMessage("Who is in my watchlist?", watchlist).label, "Current scope");
  assert.equal(routeMessage("add BBTN", watchlist).label, "Company not found");
  assert.equal(routeMessage("watch out for BMRI pricing", watchlist).kind, "research");
});

test("summaries and recall use stored findings; only an explicit ask for new data spends", () => {
  const watchlist = { name: "Banks", user_company: null, companies: COMPANY_CATALOGUE.filter((c) => ["BBCA", "BMRI", "BBRI"].includes(c.ticker)) };
  const starter = promptSuggestions(watchlist, []).find((s) => s.title === "Summarize watched companies");
  const stored = [starter.query, "Summarize my competitors", "Summarize BBRI", "What do we know about BMRI so far?",
    "What did we find last time about BBRI?", "Show me what you found on BBCA", "Recap the findings for BBCA and BMRI",
    "Ringkas temuan untuk BBCA", "Apa yang sudah kita ketahui tentang BMRI?"];
  for (const text of stored) {
    const route = routeMessage(text, watchlist);
    assert.equal(route.kind, "chat", text);
    assert.equal(route.saved, true, text);
  }
  assert.deepEqual(routeMessage("What do we know about Mandiri so far?", watchlist).companies.map((c) => c.ticker), ["BMRI"]);
  for (const text of ["Summarize the latest news on BBCA", "Get fresh news on BBCA", "Research BBCA again with new data",
    "Research BBCA and BMRI with new data", "Riset BBCA dengan data baru", "What's new with BBCA?"]) {
    assert.equal(routeMessage(text, watchlist).kind, "research", text);
  }
});

test("every catalogue company routes correctly by ticker, name and alias", () => {
  const templates = [["How is {X} doing?", "research"], ["Bagaimana kinerja {X}?", "research"],
    ["What did {X} ship in the last 30 days?", "research"], ["Riset {X} dengan data baru", "research"],
    ["Summarize {X}", "chat"], ["Ringkas temuan untuk {X}", "chat"]];
  for (const company of COMPANY_CATALOGUE) {
    const peer = COMPANY_CATALOGUE.find((c) => c.ticker !== company.ticker);
    const watchlist = { name: "Test", user_company: null, companies: [company, peer] };
    for (const form of [company.ticker, company.name, ...(COMPANY_ALIASES[company.ticker] ?? [])]) {
      for (const [template, kind] of templates) {
        const text = template.replace("{X}", form);
        const route = routeMessage(text, watchlist);
        assert.equal(route.kind, kind, text);
        assert.deepEqual(route.companies.map((c) => c.ticker), [company.ticker], text);
      }
    }
  }
});

test("common business words are never mistaken for a company", () => {
  const words = ("pricing promo discount partnership campaign launch product performance market share news report trend revenue earnings profit margin " +
    "growth sales assets equity debt loan credit deposit dividend stock shares valuation capex network branch app feature service digital payment insurance " +
    "mining coal nickel energy power property retail media advertising strategy plan expansion acquisition merger deal investor analyst rating outlook " +
    "latest fresh again update compare better leading winning risk summary overview recap review findings stored evidence competitor sector industry " +
    "harga diskon kemitraan kerja kampanye peluncuran produk kinerja pangsa berita laporan pendapatan laba rugi keuangan pertumbuhan penjualan aset utang " +
    "pinjaman kredit dividen saham valuasi neraca nasabah cabang aplikasi fitur layanan strategi rencana ekspansi akuisisi terbaru terkini perubahan " +
    "bandingkan lebih unggul risiko ringkasan temuan tersimpan merek impor ekspor riset teliti selidiki investigasi cari perbarui berapa").split(" ");
  for (const word of words) {
    for (const text of [`What are the ${word} trends?`, `apa ${word} terbaru`]) {
      const found = [...findCompanies(text), ...suggestCompanies(text).map((s) => s.company), ...missedTickers(text)];
      assert.deepEqual(found.map((c) => c.ticker), [], text);
    }
  }
});
