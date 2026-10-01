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
 * adds Bukalapak to a watchlist.
 */
const WORD_LIKE_TICKERS = new Set(["BUKA", "ACES", "MIKA", "SIDO", "WIKA"]);

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
