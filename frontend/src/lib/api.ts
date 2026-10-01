import {
  AgentRunSchema,
  AlertStatusSchema,
  ChatReplySchema,
  DashboardResponseSchema,
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

/**
 * The only file that talks to the backend.
 *
 * Every function returns parsed, validated data. Components and the store
 * never touch `fetch` or `mock-data` directly, so pointing this app at the
 * real service is a one-file change:
 *
 *   NEXT_PUBLIC_USE_MOCKS=false
 *   NEXT_PUBLIC_API_BASE=http://localhost:8000
 *
 * ── For whoever builds the backend ──────────────────────────────────────────
 * Implement these endpoints, returning the shapes in `schemas.ts`:
 *
 *   GET  /dashboard?range=week|month  -> { watchlist, aggregates, signals }
 *   GET  /signals/:id                 -> Signal
 *   POST /runs         { query }      -> AgentRun            (status "queued")
 *   GET  /runs/:id/stream             -> SSE of AgentRun     (one per update)
 *   POST /runs/:id/cancel             -> 204
 *
 * Responses are parsed with zod. A missing or misspelled field fails loudly
 * and names itself rather than rendering as `undefined` in the UI.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS !== "false";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/** Thrown for both transport and validation failures, with a readable message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  schema: { parse: (input: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  let payload: unknown;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      throw new ApiError(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
    }
    payload = await res.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Could not reach ${path}`, error);
  }

  try {
    return schema.parse(payload);
  } catch (error) {
    // Name the offending field — this is the whole point of validating.
    throw new ApiError(
      `${path} returned data this app cannot read: ${describe(error)}`,
      error,
    );
  }
}

function describe(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues: { path: unknown[]; message: string }[] })
      .issues;
    return issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`)
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
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
  return request("/watchlist", WatchlistSchema, {
    method: "PATCH",
    body: JSON.stringify({ name: watchlist.name, tickers: watchlist.companies.map((company) => company.ticker) }),
  });
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
  const response = await fetch(`${API_BASE}/api/v1/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session),
  });
  if (!response.ok) throw new ApiError(`POST /api/v1/conversations failed: ${response.status}`);
}

export async function clearConversationHistory(): Promise<void> {
  if (USE_MOCKS) return;
  const response = await fetch(`${API_BASE}/api/v1/conversations`, { method: "DELETE" });
  if (!response.ok) throw new ApiError(`DELETE /api/v1/conversations failed: ${response.status}`);
}

export async function deleteConversation(id: string): Promise<void> {
  if (USE_MOCKS) return;
  const response = await fetch(`${API_BASE}/api/v1/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new ApiError(`DELETE /api/v1/conversations failed: ${response.status}`);
}

/* ── Conversation ──────────────────────────────────────────────────────── */

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Conversational reply. The backend answers from the workspace and stored
 * findings only: no provider call, no credits, no research run.
 */
export async function sendChat(message: string, history: ChatTurn[]): Promise<ChatReply> {
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
  return request("/api/v1/chat", ChatReplySchema, {
    method: "POST",
    body: JSON.stringify({ message, history: history.slice(-10) }),
  });
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
 * Against the real backend this is an EventSource over SSE. Against mocks it
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
    const source = new EventSource(`${API_BASE}/runs/${run.id}/stream`);
    let terminal = false;
    source.onmessage = (event) => {
      try {
        const update = AgentRunSchema.parse(JSON.parse(event.data));
        terminal = update.status === "complete" || update.status === "failed";
        handlers.onUpdate(update);
        // The backend closes SSE after the terminal event. Close locally first
        // so EventSource does not misreport that expected EOF as a failure.
        if (terminal) source.close();
      } catch (error) {
        handlers.onError(
          new ApiError(`Run stream sent unreadable data: ${describe(error)}`),
        );
      }
    };
    source.onerror = () => {
      if (terminal) return;
      handlers.onError(new ApiError("Lost connection to the run stream."));
      source.close();
    };
    return () => {
      terminal = true;
      source.close();
    };
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
    await fetch(`${API_BASE}/runs/${runId}/cancel`, { method: "POST" });
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
