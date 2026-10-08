import type { Company } from "./types";

/**
 * A catalogue of Indonesian public companies to build watchlists from.
 *
 * Ticker, name and industry only — no figures. Every number in this product
 * comes from Sectors at request time and is labelled as a fact; nothing
 * financial is ever hard-coded here.
 *
 * Replace with Sectors company discovery (`GET /companies?q=`) when the
 * backend lands. `searchCatalogue` is already shaped like that call.
 */
export const COMPANY_CATALOGUE: Company[] = [
  // Telecommunication
  { ticker: "TLKM", name: "Telkom Indonesia", industry: "Telecommunication" },
  {
    ticker: "ISAT",
    name: "Indosat Ooredoo Hutchison",
    industry: "Telecommunication",
  },
  { ticker: "EXCL", name: "XL Axiata", industry: "Telecommunication" },
  { ticker: "FREN", name: "Smartfren Telecom", industry: "Telecommunication" },
  {
    ticker: "TOWR",
    name: "Sarana Menara Nusantara",
    industry: "Telecommunication",
  },
  {
    ticker: "TBIG",
    name: "Tower Bersama Infrastructure",
    industry: "Telecommunication",
  },

  // Banking
  { ticker: "BBCA", name: "Bank Central Asia", industry: "Banking" },
  { ticker: "BBRI", name: "Bank Rakyat Indonesia", industry: "Banking" },
  { ticker: "BMRI", name: "Bank Mandiri", industry: "Banking" },
  { ticker: "BBNI", name: "Bank Negara Indonesia", industry: "Banking" },
  { ticker: "ARTO", name: "Bank Jago", industry: "Banking" },
  { ticker: "BRIS", name: "Bank Syariah Indonesia", industry: "Banking" },

  // Technology
  { ticker: "GOTO", name: "GoTo Gojek Tokopedia", industry: "Technology" },
  { ticker: "BUKA", name: "Bukalapak.com", industry: "Technology" },
  { ticker: "EMTK", name: "Elang Mahkota Teknologi", industry: "Technology" },
  { ticker: "MTDL", name: "Metrodata Electronics", industry: "Technology" },

  // Consumer goods
  { ticker: "UNVR", name: "Unilever Indonesia", industry: "Consumer goods" },
  { ticker: "ICBP", name: "Indofood CBP Sukses Makmur", industry: "Consumer goods" },
  { ticker: "INDF", name: "Indofood Sukses Makmur", industry: "Consumer goods" },
  { ticker: "MYOR", name: "Mayora Indah", industry: "Consumer goods" },

  // Retail
  { ticker: "AMRT", name: "Sumber Alfaria Trijaya", industry: "Retail" },
  { ticker: "ACES", name: "Aspirasi Hidup Indonesia", industry: "Retail" },
  { ticker: "MAPI", name: "Mitra Adiperkasa", industry: "Retail" },
  { ticker: "ERAA", name: "Erajaya Swasembada", industry: "Retail" },

  // Healthcare
  { ticker: "KLBF", name: "Kalbe Farma", industry: "Healthcare" },
  { ticker: "SIDO", name: "Industri Jamu dan Farmasi Sido Muncul", industry: "Healthcare" },
  { ticker: "MIKA", name: "Mitra Keluarga Karyasehat", industry: "Healthcare" },

  // Energy
  { ticker: "PGAS", name: "Perusahaan Gas Negara", industry: "Energy" },
  { ticker: "PTBA", name: "Bukit Asam", industry: "Energy" },
  { ticker: "MEDC", name: "Medco Energi Internasional", industry: "Energy" },

  // Basic materials
  { ticker: "ANTM", name: "Aneka Tambang", industry: "Basic materials" },
  { ticker: "INCO", name: "Vale Indonesia", industry: "Basic materials" },
  { ticker: "SMGR", name: "Semen Indonesia", industry: "Basic materials" },
  { ticker: "INTP", name: "Indocement Tunggal Prakarsa", industry: "Basic materials" },

  // Infrastructure
  { ticker: "JSMR", name: "Jasa Marga", industry: "Infrastructure" },
  { ticker: "WIKA", name: "Wijaya Karya", industry: "Infrastructure" },
];

/**
 * What people actually call these companies. Nobody types "BBRI" in
 * conversation; they type "BRI", "bank BRI", or "Mandiri".
 *
 * Deliberately absent: bare words that are also everyday Indonesian or English
 * ("jago" = skilled, "map", "sig", "axis"). Those companies are reachable
 * through their full names instead.
 */
export const COMPANY_ALIASES: Record<string, string[]> = {
  TLKM: ["telkom", "telkom indonesia", "telkomsel", "indihome"],
  ISAT: ["indosat", "indosat ooredoo", "ioh", "im3"],
  EXCL: ["xl", "xl axiata", "xlsmart"],
  FREN: ["smartfren"],
  TOWR: ["protelindo", "sarana menara"],
  TBIG: ["tower bersama"],
  BBCA: ["bca", "bank bca", "bank central asia"],
  BBRI: ["bri", "bank bri", "bank rakyat", "bank rakyat indonesia"],
  BMRI: ["mandiri", "bank mandiri"],
  BBNI: ["bni", "bank bni", "bank negara indonesia"],
  ARTO: ["bank jago"],
  BRIS: ["bsi", "bank bsi", "bank syariah indonesia"],
  GOTO: ["goto", "gojek", "tokopedia"],
  BUKA: ["bukalapak"],
  EMTK: ["emtek", "elang mahkota"],
  MTDL: ["metrodata"],
  UNVR: ["unilever"],
  ICBP: ["indofood cbp"],
  INDF: ["indofood"],
  MYOR: ["mayora"],
  AMRT: ["alfamart", "alfaria"],
  ACES: ["ace hardware", "azko"],
  MAPI: ["mitra adiperkasa"],
  ERAA: ["erajaya", "erafone"],
  KLBF: ["kalbe", "kalbe farma"],
  SIDO: ["sido muncul"],
  MIKA: ["mitra keluarga"],
  PGAS: ["pgn", "perusahaan gas negara"],
  PTBA: ["bukit asam"],
  MEDC: ["medco", "medco energi"],
  ANTM: ["antam", "aneka tambang"],
  INCO: ["vale", "vale indonesia"],
  SMGR: ["semen indonesia", "semen gresik"],
  INTP: ["indocement"],
  JSMR: ["jasa marga"],
  WIKA: ["wijaya karya"],
};

/**
 * Tickers that are also ordinary words ("buka" = open, "aces", "mika", ...).
 * These match only when written in capitals, so "tolong buka halaman" never
 * adds Bukalapak to a watchlist. Exported so the router can suggest the
 * capitalised form instead of pretending it heard nothing.
 */
export const WORD_LIKE_TICKERS = new Set(["BUKA", "ACES", "MIKA", "SIDO", "WIKA"]);

interface Pattern {
  company: Company;
  text: string;
  caseSensitive: boolean;
}

const PATTERNS: Pattern[] = COMPANY_CATALOGUE.flatMap((company) => [
  { company, text: company.ticker, caseSensitive: WORD_LIKE_TICKERS.has(company.ticker) },
  { company, text: company.name.toLowerCase(), caseSensitive: false },
  ...(COMPANY_ALIASES[company.ticker] ?? []).map((alias) => ({ company, text: alias, caseSensitive: false })),
])
  // Longest first, so "indofood cbp" claims its words before "indofood" can.
  .sort((a, b) => b.text.length - a.text.length);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every catalogue company mentioned in free text, in order of appearance.
 * Matches tickers, full names and everyday aliases on whole-word boundaries,
 * and never lets two companies claim the same words.
 */
export function findCompanies(text: string): Company[] {
  const claimed: [number, number][] = [];
  const found: { company: Company; at: number }[] = [];

  for (const pattern of PATTERNS) {
    const source = `(?<![\\p{L}\\p{N}])${escapeRegExp(pattern.text).replace(/ /g, "\\s+")}(?![\\p{L}\\p{N}])`;
    const regex = new RegExp(source, pattern.caseSensitive ? "gu" : "giu");
    for (const match of text.matchAll(regex)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      claimed.push([start, end]);
      found.push({ company: pattern.company, at: start });
    }
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((item) => item.company)
    .filter((company) => !seen.has(company.ticker) && seen.add(company.ticker));
}

/**
 * Tickers the user probably meant but typed in lowercase. WORD_LIKE_TICKERS
 * only match in capitals (they double as everyday words), so "investigate
 * sido" matches nothing — surface SIDO explicitly instead of pretending
 * nothing was heard.
 */
export function missedTickers(text: string): Company[] {
  const found = new Set(findCompanies(text).map((c) => c.ticker));
  const missed: Company[] = [];
  for (const ticker of WORD_LIKE_TICKERS) {
    if (found.has(ticker)) continue;
    const company = COMPANY_CATALOGUE.find((c) => c.ticker === ticker);
    if (!company) continue;
    if (new RegExp(`(?<![\\p{L}\\p{N}])${ticker}(?![\\p{L}\\p{N}])`, "iu").test(text)) {
      missed.push(company);
    }
  }
  return missed;
}

/** Edit distance with adjacent transposition ("brbi" -> BBRI, "comapre" ->
 * "compare" cost a single edit, as typed typos usually do). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1);
      }
    }
  }
  return grid[a.length][b.length];
}

export interface CompanyTypo {
  company: Company;
  /** The exact token as typed, replaced verbatim when building the fix. */
  token: string;
}

/** Every known surface word, lowercased: tokens equal to one of these were
 * already handled exactly and must never suggest a *different* company
 * ("bri" must not offer BRIS). */
const KNOWN_WORDS: Set<string> = (() => {
  const words = new Set<string>();
  for (const company of COMPANY_CATALOGUE) {
    words.add(company.ticker.toLowerCase());
    for (const word of company.name.toLowerCase().split(/[\s-]+/)) words.add(word);
    for (const alias of COMPANY_ALIASES[company.ticker] ?? []) {
      for (const word of alias.toLowerCase().split(/\s+/)) words.add(word);
    }
  }
  return words;
})();

/** Common words that must never read as typos ("ada"/"and" are a single
 * edit from "add"; circumfix morphology makes "perubahan" two edits from
 * "perusahaan"). Checked in both typo paths. */
export const TYPO_STOPWORDS = new Set([
  "ada", "dan", "yang", "itu", "ini", "untuk", "dengan", "dari", "saya",
  "kamu", "tidak", "bisa", "juga", "atau", "agar", "the", "and", "for",
  "with", "are", "you", "apa", "saja", "semua", "baru", "lama", "besar",
  "kecil", "tinggi", "rendah", "baik", "buruk", "harga", "berita", "pasar",
  "saham", "tren", "laba", "rugi", "untung", "naik", "turun", "berubah",
  "perubahan", "friend", "teman", "kawan",
  // Product vocabulary is not a misspelled ticker or company alias.
  "annual", "revenue", "growth", "net", "margin", "margins", "profit",
  "earnings", "sales", "market", "share", "shares", "value", "values",
  "rate", "rates", "unit", "units", "currency", "period", "scope",
  "evidence", "supporting", "position", "comparison", "limitations",
  "report", "reports", "change", "changes", "pendapatan", "tahunan",
  "pertumbuhan", "bukti", "posisi", "batasan", "laporan", "penjualan",
  // Question vocabulary the router understands ("BBCA plans" is not PGAS,
  // "NPL" is not ARTO, "berapa" is not ERAA).
  "plan", "plans", "strategy", "update", "updates", "news", "launch", "launched",
  "ship", "shipped", "release", "released", "deal", "deals", "merger", "risk", "risks",
  "lately", "recently", "recent", "doing", "better", "bigger", "leading", "winning",
  "dividend", "dividends", "stock", "stocks", "loan", "loans", "credit", "deposit",
  "deposits", "debt", "assets", "equity", "capex", "ebitda", "npl", "nim", "casa",
  "roe", "roa", "ojk", "ihsg", "idx", "ipo", "bank", "banks", "app", "apps",
  "feature", "features", "branch", "branches", "berapa", "kabar", "rencana",
  "strategi", "dividen", "kredit", "pinjaman", "utang", "aset", "cabang", "fitur",
  "aplikasi", "layanan", "rilis", "luncurkan", "terakhir", "hari", "minggu",
  "bulan", "tahun", "lagi", "ngapain", "gimana", "bagaimana", "kinerja",
  "ratio", "ratios", "rasio", "since", "sejak", "anything", "lebih",
  // Recall and fresh-data vocabulary ("fresh" is not FREN).
  "fresh", "refresh", "again", "latest", "newest", "data", "stored", "saved", "found",
  "findings", "know", "summary", "recap", "review", "overview", "terbaru", "terkini",
  "temuan", "tersimpan", "ringkas", "ringkasan", "rekap", "sebelumnya",
  // Indonesian research verbs ("riset" is not ISAT).
  "riset", "teliti", "selidiki", "investigasi", "analisis", "analisa", "bandingkan", "cari",
  // Found by checking ~375 common business words against all 36 companies.
  "trend", "trends", "power", "media", "kerja", "neraca", "merek", "impor", "ekspor",
]);

/**
 * Strip an Indonesian possessive suffix when the stem is a known word, so
 * grammar never reads as a typo: "perusahaanku" is "perusahaan" + "ku", not
 * a misspelling of anything.
 */
function stemPossessive(lower: string): string | null {
  if (lower.length < 6) return null;
  for (const suffix of ["ku", "mu", "nya"]) {
    if (lower.endsWith(suffix)) {
      const stem = lower.slice(0, -suffix.length);
      if (stem.length >= 4 && KNOWN_WORDS.has(stem)) return stem;
    }
  }
  return null;
}

/**
 * Company names the user probably mistyped ("reserch on bcca", "brbi").
 * Caps-only tickers are owned by missedTickers and skipped here; tokens that
 * match anything exactly are skipped too. Single words may match only a whole
 * ticker or single-word alias, never a fragment of a multi-word name. Phrase
 * typos need every other word to match exactly. Suggestions need a unique
 * winner within a tight threshold; financial vocabulary is excluded.
 */
export function suggestCompanies(text: string): CompanyTypo[] {
  const tokens = [...new Set(text.match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  const suggestions: CompanyTypo[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (KNOWN_WORDS.has(lower) || TYPO_STOPWORDS.has(lower) || stemPossessive(lower)) continue;
    const limit = lower.length <= 4 ? 1 : 2;
    let best: { company: Company; distance: number; tied: boolean } | null = null;
    for (const company of COMPANY_CATALOGUE) {
      if (WORD_LIKE_TICKERS.has(company.ticker)) continue;
      const candidates = [
        company.ticker,
        ...(COMPANY_ALIASES[company.ticker] ?? []).filter((alias) => !/\s/.test(alias)),
      ];
      for (const candidate of candidates) {
        if (!candidate || candidate.length < 3) continue;
        const distance = editDistance(lower, candidate.toLowerCase());
        if (distance > limit || distance === 0) continue;
        if (!best || distance < best.distance) {
          best = { company, distance, tied: false };
        } else if (distance === best.distance && best.company.ticker !== company.ticker) {
          best.tied = true;
        }
      }
    }
    if (best && !best.tied && !seen.has(best.company.ticker)) {
      seen.add(best.company.ticker);
      suggestions.push({ company: best.company, token });
    }
  }
  // Keep genuine phrase typos such as 'jasa margga' recoverable without
  // turning the ordinary word 'margin' into a Jasa Marga request. Only one
  // phrase word may be misspelled; the rest must identify the name exactly.
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  for (let start = 0; start < words.length; start++) {
    let best: { company: Company; distance: number; tied: boolean; token: string } | null = null;
    for (const company of COMPANY_CATALOGUE) {
      if (WORD_LIKE_TICKERS.has(company.ticker)) continue;
      const phrases = [company.name, ...(COMPANY_ALIASES[company.ticker] ?? [])];
      for (const phrase of phrases) {
        const parts = phrase.toLowerCase().split(/\s+/);
        if (parts.length < 2 || start + parts.length > words.length) continue;
        const window = words.slice(start, start + parts.length);
        const at = window[0].index;
        const end = window.at(-1)!.index + window.at(-1)![0].length;
        const token = text.slice(at, end);
        if (!/^[\p{L}\p{N}\s]+$/u.test(token)) continue;
        let distance = 0;
        let differences = 0;
        for (let index = 0; index < parts.length; index++) {
          const lower = window[index][0].toLowerCase();
          if (lower === parts[index]) continue;
          if (TYPO_STOPWORDS.has(lower) || KNOWN_WORDS.has(lower) || stemPossessive(lower)) {
            differences = 2;
            break;
          }
          distance = editDistance(lower, parts[index]);
          if (distance > (lower.length <= 4 ? 1 : 2)) {
            differences = 2;
            break;
          }
          differences++;
        }
        if (differences !== 1) continue;
        if (!best || distance < best.distance) {
          best = { company, distance, tied: false, token };
        } else if (distance === best.distance && best.company.ticker !== company.ticker) {
          best.tied = true;
        }
      }
    }
    if (best && !best.tied && !seen.has(best.company.ticker)) {
      seen.add(best.company.ticker);
      suggestions.push({ company: best.company, token: best.token });
    }
  }
  return suggestions.slice(0, 3);
}

/** Case-insensitive match on ticker, name, alias or industry. */
export function searchCatalogue(query: string, limit = 8): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return COMPANY_CATALOGUE.filter(
    (c) =>
      c.ticker.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q) ||
      (COMPANY_ALIASES[c.ticker] ?? []).some((alias) => alias.includes(q)),
  )
    .sort((a, b) => {
      // Exact ticker first, then ticker prefix, then everything else.
      const rank = (c: Company) =>
        c.ticker.toLowerCase() === q
          ? 0
          : c.ticker.toLowerCase().startsWith(q)
            ? 1
            : c.name.toLowerCase().startsWith(q)
              ? 2
              : 3;
      return rank(a) - rank(b) || a.ticker.localeCompare(b.ticker);
    })
    .slice(0, limit);
}

/** Watchlist size rules from the MVP scope. */
export const MIN_COMPANIES = 2;
export const MAX_COMPANIES = 5;
