import { MAX_COMPANIES, MIN_COMPANIES, findCompanies } from "./catalogue";
import type { Company, Watchlist } from "./types";

/**
 * Decides what a chat message needs, before anything costs money.
 *
 *   instant  — a workspace command or a greeting. Answered here, no network.
 *   chat     — conversation. Answered by the model with no provider data.
 *   research — the evidence pipeline. Spends Sectors credits.
 *
 * Research is the only route that spends, so it is the one that has to be
 * earned: an explicit research verb, a market topic about competitors, or a
 * named company. Everything else is conversation. The previous default ran the
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
  | { type: "rename_watchlist"; name: string };

export type AgentRoute =
  | { kind: "instant"; label: string; content: string; action?: InstantAgentAction }
  | { kind: "chat"; language: Language }
  | { kind: "research"; companies: Company[] };

// ── Vocabulary ────────────────────────────────────────────────────────────

const ID_MARKERS =
  /\b(apa|apakah|bagaimana|gimana|kamu|anda|saya|aku|tolong|bisa|tidak|nggak|enggak|gak|yang|ini|itu|untuk|dengan|kabar|terima kasih|makasih|halo|hai|selamat|siapa|kenapa|mengapa|dong|sih|kok|juga|sudah|belum|ada|mau|ingin|bantu|coba|tambahkan|hapus|ke|dari|di|berapa|tahun|lalu|sekarang|bagus|banget|lagi|ngapain|mana|kapan|bulan|minggu|kemarin|besok|nanti|tentang|perusahaan|kompetitor|bandingkan)\b/gi;

/** Ask for evidence on their own, with or without a company. */
const STRONG_RESEARCH =
  /\b(research|investigate|investigation|analy[sz]e|analysis|compare|comparison|versus|vs\.?|benchmark|what(?:'s| has| have)? changed|what is new|what's new|latest news|market sweep|competitor activity|riset|teliti|meneliti|penelitian|selidiki|investigasi|analisis|analisa|menganalisis|bandingkan|membandingkan|perbandingan|apa yang berubah|ada perubahan|perubahan apa|berita terbaru|kabar terbaru|aktivitas kompetitor)\b/i;

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

// ── Helpers ───────────────────────────────────────────────────────────────

export function detectLanguage(text: string): Language {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const hits = text.match(ID_MARKERS)?.length ?? 0;
  return hits >= 2 || (words.length > 0 && hits / words.length >= 0.25) ? "id" : "en";
}

const say = (lang: Language, en: string, id: string) => (lang === "id" ? id : en);
const names = (companies: Company[]) => companies.map((c) => `${c.name} (${c.ticker})`).join(", ");

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

  // 2. Add / remove. A verb alone is not enough: "did BRI's price drop?" must
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

  // 3. Membership questions answer from the workspace for free.
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

  // 4. Research — the only route that spends credits.
  if (strong || mentioned.length > 0 || (topical && COMPETITOR_WORDS.test(text))) {
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
      };
    }
    return { kind: "research", companies: mentioned };
  }

  // 5. Listing the watchlist.
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

  // 6. Greetings, thanks and help: instant, so they never wait on a model.
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
        "Three things: (1) watchlist commands like “add BRI” or “remove Telkom” run instantly; (2) questions about market changes, pricing, campaigns, partnerships or financials — or naming a company — run a cited investigation using Sectors data; (3) anything else, I'll just chat. Only investigations use provider credits.",
        "Tiga hal: (1) perintah watchlist seperti “tambahkan BRI” atau “hapus Telkom” langsung dijalankan; (2) pertanyaan tentang perubahan pasar, harga, kampanye, kemitraan atau keuangan — atau menyebut nama perusahaan — menjalankan investigasi berbasis data Sectors dengan sumber; (3) selain itu, saya akan mengobrol biasa. Hanya investigasi yang memakai kredit penyedia data."),
    };
  }

  // 7. Everything else is conversation. No pipeline, no credits.
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
