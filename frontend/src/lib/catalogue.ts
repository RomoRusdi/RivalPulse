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

/** Case-insensitive match on ticker, name or industry. */
export function searchCatalogue(query: string, limit = 8): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return COMPANY_CATALOGUE.filter(
    (c) =>
      c.ticker.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q),
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
