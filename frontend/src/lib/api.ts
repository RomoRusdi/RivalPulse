import { apiRequest, API_BASE, ApiError, sessionExpired, sessionHeaders, trackAccountStream } from "./http";
export { ApiError } from "./http";
import {
  AgentRunSchema,
  AlertStatusSchema,
  ChatReplySchema,
  DashboardResponseSchema,
  FindingsResponseSchema,
  RevenueFeedSchema,
  SignalSchema,
  WatchlistSchema,
} from "./schemas";
import type { AgentRun, AlertStatus, ChatReply, DashboardResponse, Range, Signal, Watchlist } from "./types";
import { parseChatHistory, type ChatSession } from "./chat-history";
import {
  ALL_SIGNALS,
  RESERVE_SIGNALS,
  RUN_STEPS,
  SEEDED_SIGNALS,
  WATCHLIST,
  aggregatesFor,
} from "./mock-data";
import { delay, readDemoSettings } from "./demo-settings";

/** Workspace requests validated against Zod contracts; authentication lives in http.ts. */

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export async function getRevenue(watchlist: Watchlist, signal?: AbortSignal) {
  if (!USE_MOCKS) return request(`/api/v1/watchlists/${encodeURIComponent(watchlist.id)}/financials`, RevenueFeedSchema, { signal });
  return RevenueFeedSchema.parse({ mode: "replay", baseYear: null, absoluteAvailable: false,
    companies: watchlist.companies.map((company) => ({ ticker: company.ticker, name: company.name, note: "Sample data",
      points: (SEEDED_SIGNALS.find((item) => item.company === company.ticker)?.financialContext.series ?? []).map((point) => ({
        year: Number(point.label), value: String(point.value), currency: null, unit: "provider_native_unspecified",
        basis: "reporting_scope_unverified", sourceUrl: "", fetchedAt: "", yoy: null, index: null,
        comparable: false, limitation: "Sample series has no verified currency, units or reporting scope.",
      })).filter((point) => Number.isInteger(point.year)),
    })) });
}

export async function getFindings(params: URLSearchParams, signal?: AbortSignal) {
  if (!USE_MOCKS) return request(`/findings?${params}`, FindingsResponseSchema, { signal });
  const { SIGNAL_CATEGORIES } = await import("./signal-categories");
  const period = params.get("period") ?? "month";
  const zone = params.get("timezone") ?? "UTC";
  const day = (stamp: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(stamp));
  const today = day(new Date().toISOString());
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - (period === "week" ? 6 : period === "month" ? 29 : 0));
  const lower = period === "custom" ? params.get("start") ?? "" : since.toISOString().slice(0, 10);
  const upper = period === "custom" ? params.get("end") ?? today : today;
  const base = SEEDED_SIGNALS.filter((item) => (!params.get("company") || item.company === params.get("company")) &&
    (period === "all" || (item.detectedAt >= lower && item.detectedAt <= upper)));
  const rows = base.filter((item) => !params.get("category") || item.type === params.get("category"));
  const offset = Number(params.get("cursor") ?? 0);
  return FindingsResponseSchema.parse({ items: rows.slice(offset, offset + 20),
    nextCursor: offset + 20 < rows.length ? String(offset + 20) : null,
    summary: { total: base.length, filtered: rows.length, companies: new Set(base.map((item) => item.company)).size,
      mix: SIGNAL_CATEGORIES.map((entry) => ({ label: entry.label, color: entry.color,
        count: base.filter((item) => item.type === entry.label).length,
        percent: base.length ? 100 * base.filter((item) => item.type === entry.label).length / base.length : 0 })) } });
}

async function request<T>(
  path: string,
  schema: { parse: (input: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await apiRequest(path, init);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Unable to connect to RivalPulse. Try again in a moment.", error);
  }

  try {
    return schema.parse(payload);
  } catch (error) {
    // Keep contract details in the cause, outside user-facing error messages.
    throw new ApiError(
      "We couldn’t read this information. Try again; contact your administrator if this continues.",
      error,
    );
  }
}



/* ── Dashboard ─────────────────────────────────────────────────────────── */

export async function getDashboard(
  range: Range,
  revealedIds: string[] = [],
): Promise<DashboardResponse> {
  const demo = readDemoSettings();

  if (!USE_MOCKS) {
    return request(`/dashboard?range=${range}`, DashboardResponseSchema);
  }

  await delay(demo.latencyMs);

  if (demo.failDashboard) {
    throw new ApiError(
      "Sectors financial context is unavailable. No cached values have been substituted.",
    );
  }

  const revealed = RESERVE_SIGNALS.filter((s) => revealedIds.includes(s.id));
  const signals = demo.empty ? [] : [...revealed, ...SEEDED_SIGNALS];

  // Parse the mocks too, so a malformed fixture fails here and not in a component.
  return DashboardResponseSchema.parse({
    mode: "replay",
    watchlist: WATCHLIST,
    aggregates: aggregatesFor(range),
    signals,
  });
}

export async function getSignal(id: string): Promise<Signal | null> {
  const demo = readDemoSettings();

  if (!USE_MOCKS) {
    return request(`/signals/${id}`, SignalSchema);
  }

  await delay(demo.latencyMs);
  const found = ALL_SIGNALS.find((s) => s.id === id);
  return found ? SignalSchema.parse(found) : null;
}

export async function getAlertStatus(): Promise<AlertStatus> {
  if (!USE_MOCKS) return request("/api/v1/alerts/status", AlertStatusSchema);
  return AlertStatusSchema.parse({
    enabled: false,
    provider: "gmail",
    recipient: null,
    minimum_severity: "high",
    delivery_policy: "One digest per completed run; baseline and unchanged findings are never emailed.",
  });
}

export async function updateWatchlist(watchlist: Watchlist): Promise<Watchlist> {
  if (USE_MOCKS) return WatchlistSchema.parse(watchlist);
  const parsed = await request(
    "/watchlist",
    WatchlistSchema,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: watchlist.name,
        tickers: watchlist.companies.map((company) => company.ticker),
        user_company: (watchlist as { user_company?: string | null }).user_company ?? null,
      }),
    },
  );
  // Legacy compat may omit user_company; keep the local value then.
  if (parsed.user_company === undefined) {
    return WatchlistSchema.parse({ ...parsed, user_company: (watchlist as { user_company?: string | null }).user_company ?? null });
  }
  return parsed;
}

/* ── Private demo session (not email/password accounts) ──────────────── */

export async function checkDemoSession(): Promise<"authenticated" | "unauthorized" | "unavailable"> {
  if (USE_MOCKS) return "authenticated";
  try {
    const response = await fetch(`${API_BASE}/api/v1/session`, { cache: "no-store" });
    if (response.ok) return "authenticated";
    return response.status === 401 ? "unauthorized" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function signInDemo(token: string): Promise<void> {
  if (USE_MOCKS) return;
  const response = await fetch(`${API_BASE}/demo/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new ApiError(response.status === 401 ? "Invalid access token." : "Sign-in is unavailable. Please try again.");
}

export async function signOutDemo(): Promise<void> {
  if (USE_MOCKS) return;
  const response = await fetch(`${API_BASE}/demo/logout`, { method: "POST" });
  if (!response.ok) throw new ApiError("Could not sign out. Please try again.");
}

/* ── Agent conversations ───────────────────────────────────────────────── */

export async function getConversationHistory(): Promise<ChatSession[]> {
  if (USE_MOCKS) return [];
  return request("/api/v1/conversations", { parse: parseChatHistory });
}

export async function saveConversation(session: ChatSession): Promise<void> {
  if (USE_MOCKS) return;
  // Stored runs are authoritative on the server. Send references rather than
  // re-uploading large evidence/financial snapshots with every chat save.
  const payload = { ...session, messages: session.messages.map(message => ({
    ...message, ...(message.run ? { run: { id: message.run.id } } : {}),
  })) };
  await apiRequest(`/api/v1/conversations`, { method: "POST", body: JSON.stringify(payload) });
}

export async function clearConversationHistory(): Promise<void> {
  if (USE_MOCKS) return;
  await apiRequest(`/api/v1/conversations`, { method: "DELETE" });
}

export async function deleteConversation(id: string): Promise<void> {
  if (USE_MOCKS) return;
  await apiRequest(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ── Conversation ──────────────────────────────────────────────────────── */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Chat never starts Sectors research. Saved recall also bypasses model inference. */
export async function sendChat(message: string, history: ChatTurn[], scope: { saved?: boolean; symbols?: string[] } = {}): Promise<ChatReply> {
  if (USE_MOCKS) {
    await delay(Math.min(readDemoSettings().latencyMs, 600));
    const indonesian = /(apa|kabar|kamu|saya|bagaimana|gimana|tolong|halo|hai)/i.test(message);
    return ChatReplySchema.parse({
      source: "fallback",
      language: indonesian ? "id" : "en",
      reply: indonesian
        ? "Saya siap membantu. Saya bisa memperbarui daftar kompetitor Anda, atau menjalankan investigasi berbasis bukti — coba “Bandingkan BBRI dan BMRI minggu ini”."
        : "I'm here and ready to help. I can update your watchlist, or run an evidence-backed investigation — try “Compare BBRI and BMRI this week”.",
    });
  }
  const send = (withScope: boolean) => request("/api/v1/chat", ChatReplySchema, {
    method: "POST",
    body: JSON.stringify({ message, history: history.slice(-10), ...(withScope && scope.saved ? { saved: true, symbols: (scope.symbols ?? []).slice(0, 10) } : {}) }),
  });
  try {
    return await send(true);
  } catch (error) {
    // A backend older than this client rejects the scope fields (422). Ask
    // again without them rather than failing the whole reply.
    if (scope.saved && error instanceof ApiError && error.status === 422) return send(false);
    throw error;
  }
}

/* ── Agent runs ────────────────────────────────────────────────────────── */

export async function startRun(query: string): Promise<AgentRun> {
  const demo = readDemoSettings();

  if (!USE_MOCKS) {
    return request(`/runs`, AgentRunSchema, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  }

  await delay(Math.min(demo.latencyMs, 300));

  return AgentRunSchema.parse({
    id: String(143 + Math.floor(Math.random() * 40)).padStart(4, "0"),
    query,
    status: "queued",
    currentStep: -1,
    steps: RUN_STEPS,
    elapsedSeconds: 0,
    etaSeconds: Math.round((RUN_STEPS.length * MOCK_STEP_MS) / 1000),
    toolCalls: [],
  });
}

export interface RunStreamHandlers {
  onUpdate: (run: AgentRun) => void;
  onError: (error: ApiError) => void;
}

/** How long each simulated step takes. */
const MOCK_STEP_MS = 1400;

/**
 * Subscribe to a run's progress. Returns an unsubscribe function.
 *
 * Against the real backend this reads SSE with authenticated fetch. Against mocks it
 * is a timer that walks the same six steps and emits the same `AgentRun`
 * shape, so no component can tell the difference.
 */
export function streamRun(
  run: AgentRun,
  /** Reserve signal this run will surface, if any. */
  revealSignalId: string | null,
  handlers: RunStreamHandlers,
): () => void {
  if (!USE_MOCKS) {
    // The backend replays the run's current state immediately on every
    // connect, so a dropped connection (sleep, network blip, tab switch) is
    // resumed by reconnecting — the backend run itself keeps going and only
    // repeated failures mark the chat message failed.
    const MAX_RECONNECTS = 3;
    let attempts = 0;
    let terminal = false;
    let closed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const connect = async () => {
      if (closed) return;
      controller = new AbortController();
      const stopTracking = trackAccountStream(controller);
      try {
        const response = await fetch(`${API_BASE}/runs/${run.id}/stream`, {
          credentials: "include", cache: "no-store", headers: sessionHeaders(), signal: controller.signal,
        });
        if (response.status === 401) { closed = true; sessionExpired(); return; }
        if (!response.ok || !response.body) throw new ApiError("Research stream is unavailable.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!closed && !terminal) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer = (buffer + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, "\n");
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            if (event.split("\n").some((line) => line === "event: auth-expired")) { closed = true; sessionExpired(); break; }
            const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
            if (!data) continue;
            const update = AgentRunSchema.parse(JSON.parse(data));
            attempts = 0; terminal = update.status === "complete" || update.status === "failed";
            handlers.onUpdate(update);
          }
        }
        await reader.cancel();
        if (!closed && !terminal) throw new ApiError("Research stream disconnected.");
      } catch {
        if (terminal || closed) return;
        if (attempts < MAX_RECONNECTS) { attempts += 1; retryTimer = setTimeout(() => { void connect(); }, 2000 * attempts); }
        else handlers.onError(new ApiError("Lost connection to the run stream."));
      } finally { stopTracking(); }
    };
    void connect();
    return () => { closed = true; terminal = true; if (retryTimer) clearTimeout(retryTimer); controller?.abort(); };
  }

  const demo = readDemoSettings();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let current = { ...run };
  const failAtStep = demo.failRun ? 3 : -1;

  const emit = (patch: Partial<AgentRun>) => {
    current = AgentRunSchema.parse({ ...current, ...patch });
    handlers.onUpdate(current);
  };

  const ticker = setInterval(() => {
    if (current.status !== "running" && current.status !== "queued") return;
    emit({
      elapsedSeconds: current.elapsedSeconds + 1,
      etaSeconds: Math.max(0, current.etaSeconds - 1),
    });
  }, 1000);

  RUN_STEPS.forEach((_, index) => {
    timers.push(
      setTimeout(
        () => {
          if (index === failAtStep) {
            clearInterval(ticker);
            emit({
              status: "failed",
              currentStep: index,
              failedTool: "get_recent_signals",
            });
            return;
          }
          if (failAtStep !== -1 && index > failAtStep) return;
          emit({
            status: "running",
            currentStep: index,
            toolCalls: MOCK_TOOL_CALLS.slice(0, index + 1),
          });
        },
        index * MOCK_STEP_MS + 400,
      ),
    );
  });

  if (failAtStep === -1) {
    timers.push(
      setTimeout(
        () => {
          clearInterval(ticker);
          emit({
            status: "complete",
            currentStep: RUN_STEPS.length,
            etaSeconds: 0,
            producedSignalIds: revealSignalId ? [revealSignalId] : [],
            resultSummary: revealSignalId
              ? "1 new signal above threshold. Enterprise positioning is the recurring theme."
              : "No new changes crossed the threshold. Stored state is unchanged.",
          });
        },
        RUN_STEPS.length * MOCK_STEP_MS + 900,
      ),
    );
  }

  return () => {
    clearInterval(ticker);
    timers.forEach(clearTimeout);
  };
}

export async function cancelRun(runId: string): Promise<void> {
  if (!USE_MOCKS) {
    await apiRequest(`/runs/${runId}/cancel`, { method: "POST" });
  }
}

/**
 * The newest in-flight run on the default watchlist, if any. Best-effort:
 * used once per page load to resume watching a run orphaned by a reload.
 * Anything but a parseable active run resolves to null — never throws.
 */
export async function getActiveRun(): Promise<AgentRun | null> {
  if (USE_MOCKS) return null;
  try {
    const payload = await apiRequest("/runs/active");
    const parsed = AgentRunSchema.safeParse(payload);
    if (!parsed.success) return null;
    const run = parsed.data;
    return run.status === "queued" || run.status === "running" ? run : null;
  } catch {
    return null;
  }
}

const MOCK_TOOL_CALLS = [
  { name: "resolve_companies", detail: "TLKM, ISAT, EXCL" },
  { name: "plan_evidence", detail: "4 Sectors calls queued" },
  { name: "get_company_metrics", detail: "3 companies · 2 cache hits" },
  { name: "get_recent_signals", detail: "12 candidates" },
  { name: "diff_against_state", detail: "compared with previous run" },
  { name: "score_and_store", detail: "1 above threshold" },
];
