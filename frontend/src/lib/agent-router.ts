import { MAX_COMPANIES, MIN_COMPANIES, TYPO_STOPWORDS, editDistance, findCompanies, missedTickers, suggestCompanies } from "./catalogue";
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
  | { kind: "chat"; language: Language }
  | { kind: "research"; companies: Company[] };

// ── Vocabulary ────────────────────────────────────────────────────────────

const ID_MARKERS =
  /\b(apa|apakah|bagaimana|gimana|kamu|anda|saya|aku|tolong|bisa|tidak|nggak|enggak|gak|yang|ini|itu|untuk|dengan|kabar|terima kasih|makasih|halo|hai|selamat|siapa|kenapa|mengapa|dong|sih|kok|juga|sudah|belum|ada|mau|ingin|bantu|coba|tambahkan|hapus|ke|dari|di|berapa|tahun|lalu|sekarang|bagus|banget|lagi|ngapain|mana|kapan|bulan|minggu|kemarin|besok|nanti|tentang|perusahaan|kompetitor|bandingkan)\b/gi;

/** Ask for evidence on their own, with or without a company. */
const STRONG_RESEARCH =
  /\b(research|investigate|investigation|analy[sz]e|analysis|compare|comparison|versus|vs\.?|benchmark|summar(y|ise|ize)|ringkas|rangkum|simpulkan|what(?:'s| has| have)? changed|what is new|what's new|latest news|market sweep|competitor activity|riset|teliti|meneliti|penelitian|selidiki|investigasi|analisis|analisa|menganalisis|bandingkan|membandingkan|perbandingan|apa yang berubah|ada perubahan|perubahan apa|berita terbaru|kabar terbaru|aktivitas kompetitor)\b/i;

/** Market topics. Research only when aimed at a company or at competitors. */
const TOPIC =
  /\b(financials?|revenue|earnings|profit|margin|ebitda|pricing|prices?|promo(?:tion)?s?|discounts?|partnerships?|campaigns?|launch(?:es|ed|ing)?|products?|performance|momentum|positioning|market share|news|signals?|reports?|trends?|keuangan|pendapatan|laba|rugi|keuntungan|harga|tarif|diskon|kemitraan|kerja ?sama|kampanye|peluncuran|luncur\w*|meluncurkan|produk|kinerja|performa|pangsa pasar|posisi|berita|sinyal|laporan|tren)\b/i;

const COMPETITOR_WORDS =
  /\b(competitors?|rivals?|watchlist|market|industry|sector|kompetitor|pesaing|saingan|industri|pasar|sektor)\b/i;

const WATCHLIST_WORDS = /\b(watchlist|competitors?|list|kompetitor|pesaing|saingan|daftar)\b/i;

const ADD = /\b(add|track|monitor|include|follow|watch|tambah|tambahkan|menambahkan|masukkan|masukin|pantau|ikuti|lacak)\b/i;
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
  const topical = TOPIC.test(text);

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
  const commandShaped = !(strong || topical) || WATCHLIST_WORDS.test(text);
  if ((adding || removing) && commandShaped) {
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

  // 6. "My company" referenced but no perspective set. Research would compare
  // neutrally and miss the point, so ask which company is theirs instead of
  // spending credits on the wrong framing. Explicit set-shapes ("my company
  // is X") are already handled above and never reach this.
  if (
    /\b(perusahaanku|perusahaan\s+(?:saya|kami|kita)|my\s+company|our\s+company)\b/i.test(text) &&
    !watchlist?.user_company &&
    (strong || topical)
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

  // 7. Research — the only route that spends credits. It needs BOTH an
  // intent (research verb or market topic) AND a target (named companies,
  // competitor/watchlist scope, our own company when its perspective is set,
  // or a bare "what's new" — in a monitoring product that unambiguously means
  // sweep the whole watchlist). A bare verb ("compare", "riset") or a bare
  // ticker ("BBRI") with no question never spends: it falls through to the
  // clarification step below instead.
  const blanketSweep = /^(what'?s new|whats new|what changed|ada yang baru|apa yang berubah|ada perubahan)(\s+(this week|today|minggu ini|hari ini))?\s*[?.!]*$/i.test(text);
  const aboutScope = COMPETITOR_WORDS.test(text) || WATCHLIST_WORDS.test(text);
  const ourRef =
    /\b(my company|our company|perusahaanku|perusahaan\s+(?:saya|kami|kita))\b/i.test(text);
  const hasTarget =
    mentioned.length > 0 || aboutScope || blanketSweep || (ourRef && (watchlist?.user_company ?? null));
  // Blanket phrases carry their own intent: "ada yang baru" is neither a
  // STRONG verb nor a TOPIC word, so without this it could never pass.
  if ((strong || topical || blanketSweep) && hasTarget) {
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
    // The pipeline investigates the watchlist, not arbitrary tickers. Spending
    // credits on TLKM, ISAT and EXCL to answer a question about BRI would be
    // both wrong and expensive, so stop and say so.
    const tracked = new Set(watchlist?.companies.map((c) => c.ticker) ?? []);
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
  if (mentioned.length > 0 && !strong && !topical) {
    return {
      kind: "instant",
      label: say(lang, "Clarification needed", "Perlu klarifikasi"),
      content: say(lang,
        `You mentioned ${names(mentioned)} — what should I do with ${mentioned.length === 1 ? "it" : "them"}? Say “compare ${mentioned[0].ticker} …”, “research ${mentioned[0].ticker} this week”, or ask about pricing, products, or financials. No credits were used.`,
        `Anda menyebut ${names(mentioned)} — apa yang harus saya lakukan? Ketik “bandingkan ${mentioned[0].ticker} …”, “teliti ${mentioned[0].ticker} minggu ini”, atau tanyakan soal harga, produk, atau keuangan. Tidak ada kredit yang terpakai.`),
      suggestions: [
        bubble(`research ${mentioned[0].ticker} this week`),
        bubble(`Is ${mentioned[0].ticker} in my watchlist?`),
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
            `“${watchlist?.name}” currently monitors ${names(companies)}. No research run was needed.`,
            `“${watchlist?.name}” saat ini memantau ${names(companies)}. Tidak perlu menjalankan riset.`)
        : say(lang, "This watchlist doesn't have any competitors yet.", "Watchlist ini belum memiliki kompetitor."),
    };
  }

  // 10. Greetings, thanks and help: instant, so they never wait on a model.
  if (GREETING.test(text)) {
    return {
      kind: "instant",
      label: say(lang, "Ready", "Siap"),
      content: say(lang,
        "Hi — I can update your watchlist instantly, answer questions, or run an evidence-backed competitor investigation. Ask naturally; I'll choose the smallest sufficient workflow.",
        "Halo — saya bisa memperbarui watchlist secara instan, menjawab pertanyaan, atau menjalankan investigasi kompetitor berbasis bukti. Tanyakan saja; saya akan memilih alur kerja paling hemat."),
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
        "Three things: (1) watchlist commands like “add BRI” or “remove Telkom” run instantly; (2) compare, research and investigate all run one evidence-backed pipeline using Sectors data — compare narrows the side-by-side table to the companies you name (plus yours when set), while research and investigate sweep whatever you name, or the whole watchlist; only investigations use provider credits. Tickers like SIDO or BUKA only match in capitals. Handy anytime: “status”, “credits”, “export”, “stop”, “retry”, “new chat”, “what's new”. (3) Anything else, I'll just chat.",
        "Tiga hal: (1) perintah watchlist seperti “tambahkan BRI” atau “hapus Telkom” langsung dijalankan; (2) bandingkan, teliti, dan investigasi semuanya menjalankan satu alur investigasi berbasis bukti dengan data Sectors — bandingkan mempersempit tabel perbandingan ke perusahaan yang Anda sebutkan (plus milik Anda bila diatur), sedangkan riset dan investigasi menyapu yang Anda sebutkan atau seluruh watchlist; hanya investigasi yang memakai kredit penyedia data. Kode seperti SIDO atau BUKA hanya cocok dalam huruf kapital. Praktis kapan saja: “status”, “kredit”, “export”, “stop”, “retry”, “new chat”, “ada yang baru”. (3) Selain itu, saya akan mengobrol biasa."),
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
