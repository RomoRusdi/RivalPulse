import { AgentRunSchema } from "./schemas";
import type { AgentRun } from "./types";
import type { RouteSuggestion } from "./agent-router";

const STORAGE_KEY = "rivalpulse.chat-history.v1";
const MAX_SESSIONS = 30;

export type ChatMessageKind = "text" | "instant" | "research" | "chat";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  kind: ChatMessageKind;
  content: string;
  label?: string;
  createdAt: string;
  run?: AgentRun;
  /** Tappable follow-ups. Restored from storage like everything else. */
  suggestions?: RouteSuggestion[];
  /**
   * A conversational reply still being written. Never restored from storage:
   * after a reload there is no request left to finish it.
   */
  pending?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function loadChatHistory(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return parseChatHistory(value);
  } catch {
    return [];
  }
}

export function parseChatHistory(value: unknown): ChatSession[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SESSIONS).flatMap(parseSession);
}

/** A session as it may be stored: replies still being written are left out. */
export function persistable(session: ChatSession): ChatSession {
  return { ...session, messages: session.messages.filter((message) => !message.pending) };
}

export function saveChatHistory(sessions: ChatSession[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS).map(persistable)));
  } catch {
    // Chat remains usable when storage is unavailable.
  }
}

function parseSession(value: unknown): ChatSession[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Partial<ChatSession>;
  if (
    typeof row.id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.createdAt !== "string" ||
    typeof row.updatedAt !== "string" ||
    !Array.isArray(row.messages)
  ) return [];

  const messages = row.messages.flatMap(parseMessage);
  return [{ ...row, id: row.id, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt, messages }];
}

function parseMessage(value: unknown): ChatMessage[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Partial<ChatMessage>;
  const kind = row.kind;
  if (
    typeof row.id !== "string" ||
    (row.role !== "user" && row.role !== "assistant") ||
    (kind !== "text" && kind !== "instant" && kind !== "research" && kind !== "chat") ||
    typeof row.content !== "string" ||
    typeof row.createdAt !== "string"
  ) return [];
  const run = row.run ? AgentRunSchema.safeParse(row.run) : null;
  const suggestions = Array.isArray(row.suggestions)
    ? row.suggestions
      .filter(
        (s): s is RouteSuggestion =>
          !!s &&
          typeof s === "object" &&
          typeof (s as Partial<RouteSuggestion>).label === "string" &&
          typeof (s as Partial<RouteSuggestion>).prompt === "string",
      )
      .slice(0, 4)
      .map((s) => ({ label: s.label.slice(0, 80), prompt: s.prompt.slice(0, 500) }))
    : undefined;
  return [{
    id: row.id,
    role: row.role,
    kind,
    content: row.content,
    label: typeof row.label === "string" ? row.label : undefined,
    createdAt: row.createdAt,
    run: run?.success ? run.data : undefined,
    ...(suggestions?.length ? { suggestions } : null),
  }];
}
