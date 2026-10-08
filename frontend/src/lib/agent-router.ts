import { COMPANY_CATALOGUE, MAX_COMPANIES, MIN_COMPANIES, TYPO_STOPWORDS, editDistance, findCompanies, missedTickers, suggestCompanies } from "./catalogue";
import type { Company, Watchlist } from "./types";

/**
 * Decides what a chat message needs, before anything costs money.
 *
 *   instant  — a workspace command or a greeting. Answered here, no network.
 *   chat     — conversation. Answered by the model with no provider data.
 *   research — the evidence pipeline. Spends Sectors credits.
 *
 * Research is the only route that spends, so it is the one that has to be
 * earned: an explicit research verb or market topic PLUS a target — named
 * companies, or competitor/watchlist scope ("my competitors", "my watchlist").
 * A bare verb ("compare") or a bare ticker ("BBRI") with no question gets a
 * clarification instead of a pipeline run, so stray words never cost credits.
 * Everything else is conversation. The previous default ran the
 * pipeline on anything unrecognised, so "how is your day" cost nine credits and
 * failed validation.
 *
 * Commands are understood in English and Bahasa Indonesia, and replies follow
 * the user's language.
 */

export type Language = "en" | "id";

export type InstantAgentAction =
  | { type: "add_companies"; companies: Company[] }
  | { type: "remove_companies"; tickers: string[] }
  | { type: "rename_watchlist"; name: string }
  | { type: "set_our_company"; ticker: string | null };

/** A tappable bubble under a reply: label shown, prompt sent on click. */
export interface RouteSuggestion {
  label: string;
  prompt: string;
}

export type AgentRoute =
  | { kind: "instant"; label: string; content: string; action?: InstantAgentAction; suggestions?: RouteSuggestion[] }
  | { kind: "chat"; language: Language; saved?: boolean; companies?: Company[] }
  | { kind: "research"; companies: Company[] };

// ── Vocabulary ────────────────────────────────────────────────────────────

const ID_MARKERS =
  /\b(apa|apakah|bagaimana|gimana|kamu|anda|saya|aku|tolong|bisa|tidak|nggak|enggak|gak|yang|ini|itu|untuk|dengan|kabar|terima kasih|makasih|halo|hai|selamat|siapa|kenapa|mengapa|dong|sih|kok|juga|sudah|belum|ada|mau|ingin|bantu|coba|tambahkan|hapus|ke|dari|di|berapa|tahun|lalu|sekarang|bagus|banget|lagi|ngapain|mana|kapan|bulan|minggu|kemarin|besok|nanti|tentang|perusahaan|kompetitor|bandingkan|lebih|atau|aja|saja|terakhir|dilakukan|ceritakan|rencana|strategi|dividen|berita|kinerja|unggul)\b/gi;

/** Ask for evidence on their own, with or without a company. */
const STRONG_RESEARCH =
  /\b(research|investigate|investigation|analy[sz]e|analysis|compare|comparison|versus|vs\.?|benchmark|summar(y|ise|ize)|ringkas|rangkum|simpulkan|what(?:'s| has| have)? changed|what is new|what's new|latest news|market sweep|competitor activity|riset|teliti|meneliti|penelitian|selidiki|investigasi|analisis|analisa|menganalisis|bandingkan|membandingkan|perbandingan|apa yang berubah|ada perubahan|perubahan apa|berita terbaru|kabar terbaru|aktivitas kompetitor)\b/i;

/** Market topics. Research only when aimed at a company or at competitors. */
const TOPIC =
  /\b(financials?|revenue|earnings|profit|margin|ebitda|pricing|prices?|promo(?:tion)?s?|discounts?|partnerships?|campaigns?|launch(?:es|ed|ing)?|products?|performance|momentum|positioning|market share|news|signals?|reports?|trends?|keuangan|pendapatan|laba|rugi|keuntungan|harga|tarif|diskon|kemitraan|kerja ?sama|kampanye|peluncuran|luncur\w*|meluncurkan|produk|kinerja|performa|pangsa pasar|posisi|berita|sinyal|laporan|tren|dividends?|stock|shares?|valuation|market cap|balance sheet|loans?|lending|credit|deposits?|npl|nim|casa|roe|roa|capex|debt|cash ?flow|growth|net interest margin|bonds?|guidance|outlook|target price|subscribers?|customers?|dividen|saham|valuasi|kredit|pinjaman|simpanan|dpk|pertumbuhan|utang|arus kas|neraca|nasabah|pelanggan)\b/i;

/** What a company did or is doing. Aimed at a company, it means an activity sweep. */
const ACTIVITY =
  /\b(ship(?:ped|ping|s)?|releas\w*|rilis|merilis|announc\w*|umumkan|mengumumkan|roll(?:ed|ing)?[\s-]?outs?|introduc\w*|unveil\w*|debut\w*|acqui\w+|akuisisi|mergers?|deals?|expan\w+|ekspansi|plans?|planning|rencana|strateg\w*|updates?|moves?|initiatives?|features?|fitur|apps?|aplikasi|services?|layanan|branch(?:es)?|cabang|hiring|layoffs?|up to|going on|happen\w*|terjadi|doing|ngapain|lakukan|dilakukan|melakukan)\b/i;

/** Judgement and comparison asks: "is X better", "who is leading", "tell me about X". */
const JUDGMENT =
  /\b(better|worse|bigger|biggest|smaller|stronger|strongest|weaker|healthier|healthiest|winning|wins|leading|leader|ahead|behind|outperform\w*|beat(?:s|ing)?|threats?|threatening|worried|worry|watch out|risks?|risky|overview|profile|tell me about|what about|how about|info(?:rmation)? (?:on|about)|how(?:'s| is| are)\b.*\bdoing|lebih (?:bagus|baik|besar|kecil|kuat|unggul|sehat|buruk)|unggul|menang|ancaman|khawatir|risiko|ceritakan|gambaran|profil|gimana|bagaimana)\b/i;

/** A time window implies "what happened in it". */
const TIME_WINDOW =
  /\b(?:(?:last|past|previous)\s+(?:\d+\s+)?(?:days?|weeks?|months?|quarters?|years?)|this\s+(?:week|month|quarter|year)|lately|recently|recent|so far|\d+\s+(?:hari|minggu|bulan)\s+terakhir|(?:minggu|bulan|tahun)\s+(?:ini|lalu)|akhir-akhir ini|belakangan(?: ini)?|baru-baru ini)\b/i;

/** Question shape. With a named company it is enough intent on its own. */
const QUESTION =
  /\?\s*$|^(?:what|what's|whats|which|who|whose|how|how's|why|when|where|is|are|was|were|does|do|did|can|could|should|will|would|has|have|any|apa|apakah|bagaimana|gimana|siapa|mana|kapan|kenapa|mengapa|berapa|adakah|ada)\b/i;

/** Buy/sell asks get a polite refusal plus research bubbles, never a run. */
const ADVICE =
  /\b(?:should i (?:buy|sell|invest|hold)|good time to (?:buy|sell|invest)|worth (?:buying|investing)|buy or sell|(?:buy|sell|hold) (?:recommendation|call)|layak (?:dibeli|beli)|beli atau jual|sebaiknya (?:beli|jual)|saatnya (?:beli|jual))\b/i;

/** Asks about what is already known. Answered from stored findings, free. */
const STORED =
  /\b(stored|saved|already (?:collected|found|know|have)|existing|so far|last time|previous(?:ly)?|past (?:findings|research|runs?)|(?:we|you) (?:found|collected|have found)|what (?:do|did) (?:we|you) (?:know|find)|(?:our|my|the) findings|findings so far|tersimpan|sudah (?:ada|dikumpulkan|kita ketahui|ditemukan)|yang sudah|sebelumnya|sejauh ini|temuan)\b/i;

/** Summary verbs. Without a request for new data they summarise what is stored. */
const SUMMARY_ASK = /\b(summar(?:y|ise|ize|ies)|recap|overview|rundown|digest|review|ringkas\w*|rangkum\w*|rekap\w*|ikhtisar)\b/i;

/** An explicit request for new data: the only way a recall-shaped ask spends. */
const FRESH =
  /\b(fresh|new data|new research|collect new|fetch|search latest|research latest|latest|newest|up[- ]to[- ]date|right now|today|this week|again|re-?run|refresh|re-?check|ambil terbaru|terbaru|terkini|perbarui|data baru|ulangi|sekarang|hari ini|minggu ini)\b/i;

/** Explicit research verbs ask for an investigation, not a recap. */
const NEW_RESEARCH = /\b(research|investigate|investigation|look up|search|riset|teliti|selidiki|investigasi|cari)\b/i;

/** Name lookups ("what is BBCA?") are conversation, not an investigation. */
const NAME_LOOKUP = /\b(?:stand for|full name|nama lengkap|singkatan)\b|^(?:what|who)(?:'s|\s+is)\s+[\w.]+\s*\??$|^apa itu\s+[\w.]+\s*\??$/i;

const COMPETITOR_WORDS =
  /\b(competitors?|rivals?|watchlist|market|industry|sector|kompetitor|pesaing|saingan|industri|pasar|sektor)\b/i;

const WATCHLIST_WORDS = /\b(watchlist|competitors?|list|kompetitor|pesaing|saingan|daftar)\b/i;

const ADD = /\b(add|track(?!\s+record)|monitor|include|follow|watch(?!\s+(?:out|for))|tambah|tambahkan|menambahkan|masukkan|masukin|pantau|ikuti|lacak)\b/i;
const REMOVE =
  /\b(remove|delete|drop|untrack|unfollow|stop (?:monitoring|tracking|watching)|hapus|hapuskan|keluarkan|buang|copot|berhenti (?:memantau|melacak|mengikuti))\b/i;

const RENAME = [
  /\b(?:rename|call)\s+(?:my\s+|the\s+)?watchlist\s+(?:to|as)\s+["“']?([^"”']{2,80})["”']?\s*$/i,
  /\b(?:ganti nama|ubah nama|namai|namakan)\s+(?:watchlist|daftar(?: kompetitor)?)(?:\s+(?:saya|ku|ini))?\s+(?:menjadi|jadi|ke|dengan)\s+["“']?([^"”']{2,80})["”']?\s*$/i,
];

/** "my company is TLKM" / "our company is BRI" / "we are Mandiri" — optional perspective. */
const OUR_COMPANY_CLEAR =
  /\b(?:clear|remove|unset|hapuskan?)\s+(?:my|our)\s+company\b/i;

const LIST = [
  /\b(?:list|show|who|which)\b.*\b(?:watchlist|competitors?|companies)\b/i,
  /\bwhat\b.*\b(?:companies|competitors?)\b.*\b(?:in|on)\b.*\bwatchlist\b/i,
  /\b(?:watchlist|competitors?)\b.*\b(?:contain|include|tracking|monitoring)\b/i,
  /\b(?:siapa|apa)\s+saja\b.*\b(?:kompetitor|pesaing|watchlist|daftar|perusahaan)\b/i,
  /\b(?:tampilkan|lihat|tunjukkan|sebutkan|daftar)\b.*\b(?:kompetitor|pesaing|watchlist|perusahaan)\b/i,
  /\b(?:kompetitor|pesaing|watchlist)\s+(?:saya|ku|kita)\s+(?:siapa|apa)\b/i,
];

/** "Is BRI in my watchlist?" names a company but is a yes/no question. */
const MEMBERSHIP =
  /\b(?:is|are|do i|am i|apakah|ada)\b.*\b(?:in|on|tracking|monitoring|watching|di|dalam|termasuk)\b.*\b(?:watchlist|list|daftar|kompetitor|pesaing)\b/i;

const GREETING = /^(?:hi|hello|hey|hai|halo|hallo|helo|yo|pagi|siang|sore|malam|good (?:morning|afternoon|evening)|selamat (?:pagi|siang|sore|malam))[!.\s]*$/i;
const THANKS = /^(?:thanks|thank you|thx|ok|okay|got it|cool|nice|terima kasih|makasih|oke|ok sip|sip|siap|baik|mantap)[!.\s]*$/i;
const HELP =
  /\b(what can you do|how do i use|help me use|help$|^help\b|apa yang bisa (?:kamu|anda) lakukan|kamu bisa apa|bisa apa saja|cara (?:pakai|menggunakan)|bantuan)\b/i;

/**
 * Blatant non-product requests (coding etc.). Kept deliberately narrow so a
 * finance question never trips it — the backend chat scope is the authority
 * for everything else. Catches code fences and explicit code asks before they
 * can reach the credit-spending research route ("analyze my python script").
 */
const OUT_OF_SCOPE =
  /```|\b(python|javascript|typescript|\bjava\b|kotlin|swift|golang|rust\b|php|ruby|leetcode|hackerrank|codeforces|docker|kubernetes|terraform)\b|\bwrite\s+(?:me\s+|a\s+)?(?:code|function|script|program)\b|\bdebug\s+(?:my|this|the)\s+code\b|\bcoding\s+(?:question|problem|interview|challenge|homework)\b/i;

// ── Helpers ───────────────────────────────────────────────────────────────

export function detectLanguage(text: string): Language {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const hits = text.match(ID_MARKERS)?.length ?? 0;
  return hits >= 2 || (words.length > 0 && hits / words.length >= 0.25) ? "id" : "en";
}

const say = (lang: Language, en: string, id: string) => (lang === "id" ? id : en);
const names = (companies: Company[]) => companies.map((c) => `${c.name} (${c.ticker})`).join(", ");

/** Intent words whose typo'd forms ("reserch", "comapre") still name an
 * intent. Checked with the same tight thresholds as company typos. */
const INTENT_WORDS = [
  "compare", "research", "investigate", "analyze", "analyse", "summarize",
  "add", "remove", "bandingkan", "teliti", "selidiki", "analisa", "ringkas",
  "tambahkan", "hapus",
];

function nearIntent(text: string): { word: string; token: string } | null {
  const tokens = text.match(/[\p{L}]{3,}/gu) ?? [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (TYPO_STOPWORDS.has(lower)) continue;
    const limit = lower.length <= 4 ? 1 : 2;
    for (const word of INTENT_WORDS) {
      if (word === lower) continue;
      if (Math.abs(word.length - lower.length) > 2) continue;
      if (editDistance(lower, word) <= Math.min(limit, 2)) return { word, token };
    }
  }
  return null;
}

/** Replace the first case-insensitive occurrence of a mistyped token. */
function fixToken(text: string, token: string, replacement: string): string {
  const at = text.toLowerCase().indexOf(token.toLowerCase());
  if (at === -1) return text;
  return `${text.slice(0, at)}${replacement}${text.slice(at + token.length)}`;
}

/** Short bubble label: the prompt itself, capped so bubbles stay tappable. */
function bubble(prompt: string): RouteSuggestion {
  const label = prompt.length > 48 ? `${prompt.slice(0, 47).trimEnd()}…` : prompt;
  return { label, prompt };
}

// ── Router ────────────────────────────────────────────────────────────────

export function routeMessage(input: string, watchlist: Watchlist | null): AgentRoute {
  const text = input.trim();
  const lang = detectLanguage(text);
  const mentioned = findCompanies(text);
  const strong = STRONG_RESEARCH.test(text);
  // Saved-evidence requests must not silently become billable news collection.
  // Existing data first. Recall asks ("what do we know", "summarize BBRI",
  // "ringkas temuan") read stored findings for free; only an explicit ask for
  // new data, or an explicit research verb, may spend credits.
  const saved = STORED.test(text);
  const fresh = FRESH.test(text);
  const recall = (saved && !fresh) || (SUMMARY_ASK.test(text) && !fresh && !NEW_RESEARCH.test(text));
  const topical = TOPIC.test(text);
  const activity = ACTIVITY.test(text);
  const judgment = JUDGMENT.test(text);
  const timed = TIME_WINDOW.test(text);
  const asks = QUESTION.test(text);

  // 1. Rename.
  for (const pattern of RENAME) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      return {
        kind: "instant",
        label: say(lang, "Watchlist updated", "Watchlist diperbarui"),
        content: say(lang,
          `Done — I renamed this watchlist to “${name}”. No research or provider credits were needed.`,
          `Selesai — watchlist ini saya ganti namanya menjadi “${name}”. Tidak perlu riset atau kredit penyedia data.`),
        action: { type: "rename_watchlist", name },
      };
    }
  }

  // 2. Our company (optional perspective for relative comparison).
  if (OUR_COMPANY_CLEAR.test(text)) {
    return {
      kind: "instant",
      label: say(lang, "Perspective cleared", "Perspektif dihapus"),
      content: say(lang,
        "Done — I cleared your company perspective. Comparisons are neutral again. No credits were used.",
        "Selesai — perspektif perusahaan Anda dihapus. Perbandingan kembali netral. Tanpa kredit."),
      action: { type: "set_our_company", ticker: null },
    };
  }
  if (/\b(?:my|our)\s+company\s+is\b|\bis\s+my\s+company\b|\bwe\s+are\b|\bperusahaan\s+(?:saya|kami|kita)\b|\badalah\s+perusahaanku\b|\bperusahaanku\s+(?:adalah|ialah|yaitu)\b/i.test(text) && mentioned.length > 0) {
    const picked = mentioned[0];
    return {
      kind: "instant",
      label: say(lang, "Perspective set", "Perspektif disimpan"),
      content: say(lang,
        `${picked.name} (${picked.ticker}) is now your company perspective. Research will compare relative to ${picked.ticker}. Say “clear my company” to go neutral again.`,
        `${picked.name} (${picked.ticker}) kini menjadi perspektif perusahaan Anda. Riset akan dibandingkan relatif terhadap ${picked.ticker}. Ketik “hapus perusahaan saya” untuk kembali netral.`),
      action: { type: "set_our_company", ticker: picked.ticker },
    };
  }

  // 3. Add / remove. A verb alone is not enough: "did BRI's price drop?" must
  // not remove BRI. The command needs a company, and must either carry no
  // research topic or name the watchlist explicitly.
  const adding = ADD.test(text);
  const removing = REMOVE.test(text);
  const commandShaped = !(strong || topical || activity || judgment) || WATCHLIST_WORDS.test(text);
  if ((adding || removing) && commandShaped) {
    const known = new Set(COMPANY_CATALOGUE.map((company) => company.ticker));
    const unknown = [...new Set(text.match(/\b[A-Z]{4}\b/g) ?? [])].filter((ticker) => !known.has(ticker));
    if (mentioned.length === 0 && unknown.length > 0) {
      return {
        kind: "instant",
        label: say(lang, "Company not found", "Perusahaan tidak ditemukan"),
        content: say(lang,
          `I couldn't find ${unknown.join(", ")} in RivalPulse's company list, so nothing changed. Check the ticker, or search for it under Competitors.`,
          `Saya tidak menemukan ${unknown.join(", ")} di daftar perusahaan RivalPulse, jadi tidak ada yang berubah. Periksa kode sahamnya, atau cari di halaman Kompetitor.`),
      };
    }
    if (mentioned.length === 0) {
      if (WATCHLIST_WORDS.test(text)) {
        return {
          kind: "instant",
          label: say(lang, "Clarification needed", "Perlu klarifikasi"),
          content: say(lang,
            `I can ${adding ? "add" : "remove"} that competitor instantly. Tell me its IDX ticker or a name I'd recognise — for example “BRI”, “Mandiri” or “Telkom”.`,
            `Saya bisa ${adding ? "menambahkan" : "menghapus"} kompetitor itu secara instan. Sebutkan kode saham IDX atau namanya — misalnya “BRI”, “Mandiri” atau “Telkom”.`),
        };
      }
    } else if (!watchlist) {
      return {
        kind: "instant",
        label: say(lang, "Watchlist unavailable", "Watchlist belum siap"),
        content: say(lang,
          "The workspace is still loading. Try that command again in a moment.",
          "Workspace masih dimuat. Coba perintah itu lagi sebentar lagi."),
      };
    } else {
      return adding ? addCompanies(mentioned, watchlist, lang) : removeCompanies(mentioned, watchlist, lang);
    }
  }

  // 4. Membership questions answer from the workspace for free.
  if (mentioned.length > 0 && !strong && MEMBERSHIP.test(text)) {
    const tracked = new Set(watchlist?.companies.map((c) => c.ticker) ?? []);
    const inside = mentioned.filter((c) => tracked.has(c.ticker));
    const outside = mentioned.filter((c) => !tracked.has(c.ticker));
    const parts = [
      inside.length ? say(lang, `${names(inside)}: yes, monitored.`, `${names(inside)}: ya, sedang dipantau.`) : "",
      outside.length ? say(lang, `${names(outside)}: not yet — say “add ${outside[0].ticker}” to include it.`,
                                 `${names(outside)}: belum — ketik “tambahkan ${outside[0].ticker}” untuk memasukkannya.`) : "",
    ].filter(Boolean);
    return { kind: "instant", label: say(lang, "Current scope", "Cakupan saat ini"), content: parts.join(" ") };
  }

  // 5. Out of scope — refuse instantly: no pipeline, no credits, no LLM call.
  // Placed before research so "analyze my python script" can't spend credits.
  if (OUT_OF_SCOPE.test(text)) {
    return {
      kind: "instant",
      label: say(lang, "Out of scope", "Di luar cakupan"),
      content: say(lang,
        "I can only help with RivalPulse topics — your watchlist, competitor investigations, and Indonesian market or finance questions. I can't help with coding or other unrelated questions.",
        "Saya hanya bisa membantu topik RivalPulse — watchlist Anda, investigasi kompetitor, dan pertanyaan pasar atau keuangan Indonesia. Saya tidak bisa membantu coding atau pertanyaan lain di luar itu."),
    };
  }

  // 5b. Buy/sell questions: no advice, but offer the research that informs it.
  if (ADVICE.test(text)) {
    const target = mentioned.slice(0, 2).map((c) => c.ticker);
    return {
      kind: "instant",
      label: say(lang, "No investment advice", "Bukan saran investasi"),
      content: say(lang,
        `I can't tell you whether to buy or sell${target.length ? ` ${target.join(" or ")}` : ""}. I can show what ${target.length ? "it has" : "your competitors have"} been doing and how the reported financials compare, with sources, so you can judge. No credits were used.`,
        `Saya tidak bisa menyarankan beli atau jual${target.length ? ` ${target.join(" atau ")}` : ""}. Saya bisa menunjukkan aktivitas terbaru dan perbandingan laporan keuangannya beserta sumbernya, agar Anda bisa menilai sendiri. Tidak ada kredit yang terpakai.`),
      suggestions: target.length
        ? [bubble(say(lang, `What's new with ${target.join(" and ")}?`, `Apa kabar terbaru ${target.join(" dan ")}?`)),
           bubble(say(lang, `Compare ${target.join(" and ")} financials`, `Bandingkan keuangan ${target.join(" dan ")}`))]
        : [bubble("What changed across my competitors this week?")],
    };
  }
  if (mentioned.length > 0 && NAME_LOOKUP.test(text)) return { kind: "chat", language: lang };

  // 6. "My company" referenced but no perspective set. Research would compare
  // neutrally and miss the point, so ask which company is theirs instead of
  // spending credits on the wrong framing. Explicit set-shapes ("my company
  // is X") are already handled above and never reach this.
  if (
    /\b(perusahaanku|perusahaan\s+(?:saya|kami|kita)|my\s+company|our\s+company)\b/i.test(text) &&
    !watchlist?.user_company &&
    (strong || topical || activity || judgment || timed)
  ) {
    const candidates = (watchlist?.companies ?? []).slice(0, 4);
    return {
      kind: "instant",
      label: say(lang, "Clarification needed", "Perlu klarifikasi"),
      content: say(lang,
        `You mentioned your company, but I don't know which one is yours yet. Tap one below — or pick it under Competitors → Our company — and I'll compare relative to it. No credits were used.`,
        `Anda menyebut perusahaan Anda, tapi saya belum tahu yang mana. Ketuk salah satu di bawah — atau pilih di Kompetitor → Perusahaan kami — agar perbandingan relatif terhadap perusahaan Anda. Tidak ada kredit yang terpakai.`),
      suggestions: candidates.map((company) => bubble(`my company is ${company.ticker}`)),
    };
  }

  if (recall) return { kind: "chat", language: lang, saved: true, companies: mentioned };

  // 7. Research — the only route that spends credits. It needs BOTH an
  // intent (research verb or market topic) AND a target (named companies,
  // competitor/watchlist scope, our own company when its perspective is set,
  // or a bare "what's new" — in a monitoring product that unambiguously means
  // sweep the whole watchlist). A bare verb ("compare", "riset") or a bare
  // ticker ("BBRI") with no question never spends: it falls through to the
  // clarification step below instead.
  const blanketSweep = /^(what'?s new|whats new|what changed|what has changed|has anything changed|anything new|any updates?|ada yang baru|apa yang berubah|ada perubahan|ada update)(\s+(this week|today|lately|recently|since last (?:week|month)|minggu ini|hari ini|sejak minggu lalu))?\s*[?.!]*$/i.test(text);
  const aboutScope = COMPETITOR_WORDS.test(text) || WATCHLIST_WORDS.test(text);
  const ourRef =
    /\b(my company|our company|perusahaanku|perusahaan\s+(?:saya|kami|kita))\b/i.test(text);
  const hasTarget =
    mentioned.length > 0 || aboutScope || blanketSweep || (ourRef && (watchlist?.user_company ?? null));
  // Blanket phrases carry their own intent: "ada yang baru" is neither a
  // STRONG verb nor a TOPIC word, so without this it could never pass.
  // A named company plus a question is intent on its own; competitor-scope asks
  // ("my competitors") still need a real signal so "who is in my watchlist?" lists.
  const intent = strong || topical || blanketSweep || activity || judgment || timed || (mentioned.length > 0 && asks);
  if (intent && hasTarget) {
    // A mistyped name would otherwise be silently left out of an expensive
    // investigation ("compare brbi and mandiri" would price-check Mandiri
    // alone). Ask first; a tap runs the corrected prompt, never the guess.
    const uncovered = suggestCompanies(text).filter(
      (fix) => !mentioned.some((company) => company.ticker === fix.company.ticker),
    );
    if (uncovered.length > 0) {
      return {
        kind: "instant",
        label: say(lang, "Possible match", "Mungkin maksud Anda"),
        content: say(lang,
          `Did you mean ${uncovered.map((f) => `${f.company.name} (${f.company.ticker})`).join(", ")}? I left ${uncovered.length === 1 ? "it" : "them"} out rather than investigate the wrong scope. Nothing was spent; tap to include ${uncovered.length === 1 ? "it" : "them"}.`,
          `Maksud Anda ${uncovered.map((f) => `${f.company.name} (${f.company.ticker})`).join(", ")}? Saya mengeluarkannya agar tidak menginvestigasi cakupan yang salah. Tidak ada kredit yang terpakai; ketuk untuk menyertakannya.`),
        suggestions: uncovered.map(({ company, token }) => bubble(fixToken(text, token, company.ticker))),
      };
    }
    // The backend freezes watchlist members plus the saved company perspective.
    // Other arbitrary tickers still need an explicit watchlist update so the
    // investigation cannot silently spend on a different company scope.
    const tracked = new Set(watchlist?.companies.map((c) => c.ticker) ?? []);
    if (watchlist?.user_company) tracked.add(watchlist.user_company);
    const outside = mentioned.filter((c) => !tracked.has(c.ticker));
    if (watchlist && outside.length > 0) {
      return {
        kind: "instant",
        label: say(lang, "Not in your watchlist", "Belum ada di watchlist"),
        content: say(lang,
          `${names(outside)} ${outside.length === 1 ? "isn't" : "aren't"} in “${watchlist.name}”, so an investigation wouldn't cover ${outside.length === 1 ? "it" : "them"}. Say “add ${outside[0].ticker}” first, or ask about your current competitors: ${watchlist.companies.map((c) => c.ticker).join(", ")}.`,
          `${names(outside)} belum ada di “${watchlist.name}”, jadi investigasi tidak akan mencakupnya. Ketik “tambahkan ${outside[0].ticker}” dulu, atau tanyakan tentang kompetitor Anda saat ini: ${watchlist.companies.map((c) => c.ticker).join(", ")}.`),
        suggestions: [bubble(`add ${outside[0].ticker}`)],
      };
    }
    return { kind: "research", companies: mentioned };
  }

  // 8. Bare research verbs or bare company mentions: clarify, don't spend.
  // "compare" alone names no target; "BBRI" alone asks no question. A
  // lowercase caps-only ticker ("investigate sido") names its company
  // explicitly instead.
  if (strong && !hasTarget) {
    const missed = missedTickers(text);
    if (missed.length > 0) {
      const tickers = missed.map((c) => c.ticker).join(", ");
      return {
        kind: "instant",
        label: say(lang, "Clarification needed", "Perlu klarifikasi"),
        content: say(lang,
          `Did you mean ${names(missed)}? ${tickers} only ${missed.length === 1 ? "matches" : "match"} in capitals — retry as “investigate ${tickers}” or use the full company name. Nothing was spent.`,
          `Maksud Anda ${names(missed)}? ${tickers} hanya cocok dalam huruf kapital — ulangi sebagai “investigasi ${tickers}” atau gunakan nama lengkap perusahaan. Tidak ada kredit yang terpakai.`),
        suggestions: missed.slice(0, 2).map((company) => bubble(`investigate ${company.ticker}`)),
      };
    }
    const fixes = suggestCompanies(text);
    if (fixes.length > 0) {
      return {
        kind: "instant",
        label: say(lang, "Possible match", "Mungkin maksud Anda"),
        content: say(lang,
          `Did you mean ${fixes.map((f) => `${f.company.name} (${f.company.ticker})`).join(", ")}? Nothing ran and no credits were spent; tap a suggestion to send it.`,
          `Maksud Anda ${fixes.map((f) => `${f.company.name} (${f.company.ticker})`).join(", ")}? Tidak ada yang dijalankan dan tidak ada kredit yang terpakai; ketuk saran untuk mengirimnya.`),
        suggestions: fixes.map(({ company, token }) => bubble(fixToken(text, token, company.ticker))),
      };
    }
    return {
      kind: "instant",
      label: say(lang, "Clarification needed", "Perlu klarifikasi"),
      content: say(lang,
        `To run an investigation, name a company or say “competitors” — for example “compare BBRI and BMRI”, “research TLKM this week”, or “what changed across my competitors this week”. Nothing was spent.`,
        `Untuk menjalankan investigasi, sebutkan perusahaan atau ketik “kompetitor” — misalnya “bandingkan BBRI dan BMRI”, “teliti TLKM minggu ini”, atau “apa yang berubah di kompetitor saya minggu ini”. Tidak ada kredit yang terpakai.`),
      suggestions: [
        bubble("What changed across my competitors this week?"),
        bubble("Show me my watchlist"),
      ],
    };
  }
  if (mentioned.length > 0 && !intent) {
    const [first, second] = mentioned.map((c) => c.ticker);
    const both = second ? `${first} and ${second}` : first;
    const keduanya = second ? `${first} dan ${second}` : first;
    return {
      kind: "instant",
      label: say(lang, "What would you like to know?", "Apa yang ingin Anda ketahui?"),
      content: say(lang,
        `What would you like to know about ${names(mentioned)}? Ask in your own words, for example “what has ${first} launched lately?” or “is ${first} growing faster than ${second ?? "its peers"}?”. No credits were used.`,
        `Apa yang ingin Anda ketahui tentang ${names(mentioned)}? Tanyakan dengan bahasa Anda sendiri, misalnya “${first} meluncurkan apa akhir-akhir ini?” atau “apakah ${first} tumbuh lebih cepat dari ${second ?? "pesaingnya"}?”. Tidak ada kredit yang terpakai.`),
      suggestions: [
        ...(() => { const verb = nearIntent(text); return verb ? [bubble(fixToken(text, verb.token, verb.word))] : []; })(),
        bubble(say(lang, `What's new with ${both} recently?`, `Apa yang baru dari ${keduanya} akhir-akhir ini?`)),
        bubble(say(lang, second ? `Compare ${both} financials` : `${first} financial performance`, second ? `Bandingkan keuangan ${keduanya}` : `Kinerja keuangan ${first}`)),
      ],
    };
  }

  // 9. Listing the watchlist.
  if (LIST.some((pattern) => pattern.test(text))) {
    const companies = watchlist?.companies ?? [];
    return {
      kind: "instant",
      label: say(lang, "Current scope", "Cakupan saat ini"),
      content: companies.length
        ? say(lang,
            `“${watchlist?.name}” currently monitors ${names(companies)}.`,
            `“${watchlist?.name}” saat ini memantau ${names(companies)}.`)
        : say(lang, "This watchlist doesn't have any competitors yet.", "Watchlist ini belum memiliki kompetitor."),
    };
  }

  // 10. Greetings, thanks and help: instant, so they never wait on a model.
  if (GREETING.test(text)) {
    return {
      kind: "instant",
      label: say(lang, "Ready", "Siap"),
      content: say(lang,
        "Hello. I can help you manage competitors, compare financial performance, and research recent activity with supporting sources.",
        "Halo. Saya bisa membantu Anda mengelola kompetitor, membandingkan kinerja keuangan, dan meneliti aktivitas terbaru beserta sumbernya."),
    };
  }
  if (THANKS.test(text)) {
    return {
      kind: "instant",
      label: say(lang, "Acknowledged", "Siap"),
      content: say(lang, "You're welcome. Ready when you are.", "Sama-sama. Saya siap kapan pun Anda butuh."),
    };
  }
  if (HELP.test(text)) {
    return {
      kind: "instant",
      label: say(lang, "Agent capabilities", "Kemampuan agen"),
      content: say(lang,
        "Manage your watchlist with “add BRI” or “remove Telkom”. Ask “compare ISAT and TLKM” for financial context, or “what changed across my competitors this week?” for recent activity. Research may use data credits. You can also ask for status, credits, export, stop, retry, or a new chat. Use uppercase for company tickers such as SIDO or BUKA.",
        "Kelola watchlist dengan “tambahkan BRI” atau “hapus Telkom”. Tanyakan “bandingkan ISAT dan TLKM” untuk konteks keuangan, atau “apa yang berubah di kompetitor saya minggu ini?” untuk aktivitas terbaru. Riset dapat memakai kredit data. Anda juga bisa meminta status, kredit, export, stop, retry, atau chat baru. Gunakan huruf kapital untuk kode perusahaan seperti SIDO atau BUKA."),
    };
  }

  // 11. Typo rescue — before giving up to conversation. A near-miss company
  // ("brbi"), a near-miss verb ("reserch"), or a lowercase caps-only ticker
  // ("buka prices?") becomes tappable bubbles with the corrected prompt.
  // Nothing runs until tapped: a wrong guess costs a tap, never credits.
  {
    const missed = missedTickers(text);
    const fixes = suggestCompanies(text);
    const verb = nearIntent(text);
    if (missed.length > 0 || fixes.length > 0 || verb) {
      const suggestions: RouteSuggestion[] = [
        ...missed.slice(0, 2).map((company) => bubble(`investigate ${company.ticker}`)),
        ...fixes.map(({ company, token }) => bubble(fixToken(text, token, company.ticker))),
      ];
      if (verb && !fixes.length && !missed.length) {
        suggestions.push(bubble(fixToken(text, verb.token, verb.word)));
      }
      const named = [
        ...missed.map((c) => c.ticker),
        ...fixes.map((f) => f.company.ticker),
      ].filter((ticker, i, all) => all.indexOf(ticker) === i);
      return {
        kind: "instant",
        label: say(lang, "Possible match", "Mungkin maksud Anda"),
        content: say(lang,
          `I couldn't quite parse that${named.length ? ` — did you mean ${named.join(", ")}` : ""}? Nothing ran and no credits were spent; tap a suggestion to send it.`,
          `Saya kurang memahami maksudnya${named.length ? ` — maksud Anda ${named.join(", ")}` : ""}? Tidak ada yang dijalankan dan tidak ada kredit yang terpakai; ketuk saran untuk mengirimnya.`),
        suggestions: suggestions.slice(0, 4),
      };
    }
  }

  // 12. Everything else is conversation. No pipeline, no credits.
  return { kind: "chat", language: lang };
}

function addCompanies(companies: Company[], watchlist: Watchlist, lang: Language): AgentRoute {
  const tracked = new Set(watchlist.companies.map((c) => c.ticker));
  const already = companies.filter((c) => tracked.has(c.ticker));
  const fresh = companies.filter((c) => !tracked.has(c.ticker));
  const room = Math.max(0, MAX_COMPANIES - watchlist.companies.length);
  const added = fresh.slice(0, room);
  const skipped = fresh.slice(room);

  if (added.length === 0) {
    return {
      kind: "instant",
      label: say(lang, skipped.length ? "Watchlist limit reached" : "Already monitored",
                       skipped.length ? "Batas watchlist tercapai" : "Sudah dipantau"),
      content: skipped.length
        ? say(lang,
            `“${watchlist.name}” already has ${MAX_COMPANIES} competitors. Remove one before adding ${skipped.map((c) => c.ticker).join(", ")}.`,
            `“${watchlist.name}” sudah berisi ${MAX_COMPANIES} kompetitor. Hapus salah satu sebelum menambahkan ${skipped.map((c) => c.ticker).join(", ")}.`)
        : say(lang,
            `${names(already)} ${already.length === 1 ? "is" : "are"} already in “${watchlist.name}”. Nothing changed, and no credits were spent.`,
            `${names(already)} sudah ada di “${watchlist.name}”. Tidak ada perubahan, dan tidak ada kredit yang terpakai.`),
    };
  }

  const notes = [
    already.length ? say(lang, `${names(already)} was already there.`, `${names(already)} sudah ada sebelumnya.`) : "",
    skipped.length ? say(lang,
      `${skipped.map((c) => c.ticker).join(", ")} didn't fit — the limit is ${MAX_COMPANIES}.`,
      `${skipped.map((c) => c.ticker).join(", ")} tidak muat — batasnya ${MAX_COMPANIES}.`) : "",
  ].filter(Boolean).join(" ");

  return {
    kind: "instant",
    label: say(lang, added.length === 1 ? "Competitor added" : "Competitors added",
                     "Kompetitor ditambahkan"),
    content: `${say(lang,
      `Added ${names(added)} to “${watchlist.name}”. Instant workspace action — no credits used.`,
      `${names(added)} sudah ditambahkan ke “${watchlist.name}”. Aksi instan — tanpa kredit.`)}${notes ? ` ${notes}` : ""}`,
    action: { type: "add_companies", companies: added },
  };
}

function removeCompanies(companies: Company[], watchlist: Watchlist, lang: Language): AgentRoute {
  const tracked = new Set(watchlist.companies.map((c) => c.ticker));
  const present = companies.filter((c) => tracked.has(c.ticker));
  const absent = companies.filter((c) => !tracked.has(c.ticker));
  const removable = Math.max(0, watchlist.companies.length - MIN_COMPANIES);
  const removed = present.slice(0, removable);
  const kept = present.slice(removable);

  if (removed.length === 0) {
    return {
      kind: "instant",
      label: say(lang, kept.length ? "Minimum scope protected" : "Not monitored",
                       kept.length ? "Batas minimum dijaga" : "Tidak dipantau"),
      content: kept.length
        ? say(lang,
            `A watchlist needs at least ${MIN_COMPANIES} competitors to compare. Add another before removing ${kept.map((c) => c.ticker).join(", ")}.`,
            `Watchlist membutuhkan minimal ${MIN_COMPANIES} kompetitor untuk dibandingkan. Tambahkan satu lagi sebelum menghapus ${kept.map((c) => c.ticker).join(", ")}.`)
        : say(lang,
            `${names(absent)} ${absent.length === 1 ? "isn't" : "aren't"} in “${watchlist.name}”, so nothing changed.`,
            `${names(absent)} tidak ada di “${watchlist.name}”, jadi tidak ada yang berubah.`),
    };
  }

  const notes = kept.length
    ? say(lang,
        ` Kept ${kept.map((c) => c.ticker).join(", ")} — a watchlist needs at least ${MIN_COMPANIES}.`,
        ` ${kept.map((c) => c.ticker).join(", ")} tetap dipertahankan — minimal ${MIN_COMPANIES} kompetitor.`)
    : "";

  return {
    kind: "instant",
    label: say(lang, removed.length === 1 ? "Competitor removed" : "Competitors removed", "Kompetitor dihapus"),
    content: say(lang,
      `Removed ${names(removed)} from “${watchlist.name}”. Stored evidence remains; future investigations will exclude ${removed.length === 1 ? "it" : "them"}.`,
      `${names(removed)} sudah dihapus dari “${watchlist.name}”. Bukti yang tersimpan tetap ada; investigasi berikutnya tidak akan mencakupnya.`) + notes,
    action: { type: "remove_companies", tickers: removed.map((c) => c.ticker) },
  };
}
