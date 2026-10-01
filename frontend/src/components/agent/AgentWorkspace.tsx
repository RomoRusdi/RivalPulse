"use client";

import Link from "next/link";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  FileSearch,
  History,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Route,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button, Pill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { clock, runFailureMessage } from "@/lib/format";
import { routeMessage } from "@/lib/agent-router";
import {
  type ChatMessage,
  type ChatSession,
  loadChatHistory,
  newId,
  persistable,
  saveChatHistory,
} from "@/lib/chat-history";
import type { AgentRun } from "@/lib/types";
import { type ChatTurn, clearConversationHistory, deleteConversation, getConversationHistory, saveConversation, sendChat } from "@/lib/api";

const STARTERS = [
  {
    eyebrow: "Market sweep",
    prompt: "What changed across my competitors this week, and what should marketing investigate first?",
  },
  {
    eyebrow: "Workspace command",
    prompt: "Show me who is currently in my competitor watchlist.",
  },
  {
    eyebrow: "Financial context",
    prompt: "Compare competitor financial momentum and explain what it may mean for positioning.",
  },
];

interface PendingRun {
  sessionId: string;
  messageId: string;
}

export function AgentWorkspace() {
  const store = useStore();
  const {
    activeRun,
    watchlist,
    loading,
    error,
    reload,
    startRun,
    cancelRun,
    retryRun,
    dismissRun,
    addCompanies,
    removeCompanies,
    renameWatchlist,
  } = store;
  const [draft, setDraft] = useState("");
  // A conversational reply is being written; hold the composer so replies
  // land in the order they were asked.
  const [chatPending, setChatPending] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stayAtBottom = useRef(true);
  const pendingRun = useRef<PendingRun | null>(null);
  const pendingSync = useRef<Promise<unknown>>(Promise.resolve());
  const clearingRef = useRef(false);

  const busy = activeRun?.status === "queued" || activeRun?.status === "running";
  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const local = loadChatHistory();
      getConversationHistory().catch(() => []).then((remote) => {
        if (!active) return;
        const stored = mergeHistories(local, remote);
        setSessions(stored);
        setSelectedSessionId(stored[0]?.id ?? null);
        setHistoryReady(true);
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!historyReady || clearingRef.current) return;
    saveChatHistory(sessions);
    const timer = window.setTimeout(() => {
      if (!clearingRef.current) pendingSync.current = Promise.allSettled(sessions.map((session) => saveConversation(persistable(session))));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [historyReady, sessions]);

  // Attach every streamed run update to the research message that started it.
  // This turns the conversation itself into durable local history instead of
  // showing progress in a disconnected card that disappears on navigation.
  useEffect(() => {
    if (!activeRun) return;
    const pending = pendingRun.current;
    setSessions((current) => current.map((session) => ({
      ...session,
      messages: session.messages.map((message) => {
        const matchesPending = pending?.sessionId === session.id && pending.messageId === message.id;
        const matchesRun = message.run?.id === activeRun.id;
        return matchesPending || matchesRun ? { ...message, run: activeRun } : message;
      }),
      updatedAt: pending?.sessionId === session.id ? new Date().toISOString() : session.updatedAt,
    })));
    if (activeRun.status === "complete" || activeRun.status === "failed") pendingRun.current = null;
  }, [activeRun]);

  const scrollSignature = `${selectedSession?.messages.length ?? 0}:${activeRun?.currentStep ?? -1}:${activeRun?.status ?? "idle"}:${activeRun?.toolCalls.length ?? 0}`;
  useEffect(() => {
    if (!stayAtBottom.current) return;
    requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }, [scrollSignature]);

  const appendMessages = (sessionId: string, messages: ChatMessage[], title?: string) => {
    const now = new Date().toISOString();
    setSessions((current) => {
      const existing = current.find((session) => session.id === sessionId);
      const next = existing
        ? current.map((session) => session.id === sessionId
            ? { ...session, messages: [...session.messages, ...messages], updatedAt: now }
            : session)
        : [{ id: sessionId, title: title ?? "New investigation", createdAt: now, updatedAt: now, messages }, ...current];
      return [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  };

  const launch = (query: string) => {
    const clean = query.trim();
    if (!clean || busy || chatPending || clearingRef.current) return;

    stayAtBottom.current = true;
    setShowJump(false);
    const sessionId = selectedSessionId ?? newId();
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: newId(), role: "user", kind: "text", content: clean, createdAt: now };
    const route = routeMessage(clean, watchlist);

    setSelectedSessionId(sessionId);
    setDraft("");

    if (route.kind === "instant") {
      if (route.action?.type === "add_companies") addCompanies(route.action.companies);
      if (route.action?.type === "remove_companies") removeCompanies(route.action.tickers);
      if (route.action?.type === "rename_watchlist") renameWatchlist(route.action.name);
      appendMessages(sessionId, [userMessage, {
        id: newId(), role: "assistant", kind: "instant", content: route.content,
        label: route.label, createdAt: new Date().toISOString(),
      }], conversationTitle(clean));
      return;
    }

    if (route.kind === "chat") {
      // Conversation: answered without the pipeline, so it never spends credits.
      const history: ChatTurn[] = (sessions.find((session) => session.id === sessionId)?.messages ?? [])
        .filter((message) => !message.pending)
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: (message.kind === "research" ? message.run?.resultSummary : message.content) ?? message.content,
        }));
      const replyId = newId();
      const thinking = route.language === "id" ? "Sedang berpikir…" : "Thinking…";
      appendMessages(sessionId, [userMessage, {
        id: replyId, role: "assistant", kind: "chat", content: thinking, pending: true,
        createdAt: new Date().toISOString(),
      }], conversationTitle(clean));
      setChatPending(true);
      const settle = (content: string) => setSessions((current) => current.map((session) => ({
        ...session,
        messages: session.messages.map((message) => message.id === replyId
          ? { ...message, content, pending: false, createdAt: new Date().toISOString() }
          : message),
      })));
      sendChat(clean, history)
        .then((reply) => settle(reply.reply))
        .catch(() => settle(route.language === "id"
          ? "Maaf, saya tidak bisa menjawab saat ini. Perintah watchlist dan investigasi tetap berfungsi."
          : "Sorry — I can't reply right now. Watchlist commands and investigations still work."))
        .finally(() => setChatPending(false));
      return;
    }

    // Analytical requests receive the full evidence pipeline. A completed run
    // is dismissed only from live state; its snapshot remains in chat history.
    if (activeRun && !busy) dismissRun();
    const assistantId = newId();
    appendMessages(sessionId, [userMessage, {
      id: assistantId,
      role: "assistant",
      kind: "research",
      content: "Routing this question through the evidence research workflow.",
      label: "Research investigation",
      createdAt: new Date().toISOString(),
    }], conversationTitle(clean));
    pendingRun.current = { sessionId, messageId: assistantId };
    startRun(clean);
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    launch(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const startNewChat = () => {
    if (busy || clearingRef.current) return;
    dismissRun();
    setSelectedSessionId(null);
    setDraft("");
    setHistoryOpen(false);
    stayAtBottom.current = true;
    setShowJump(false);
  };

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    setHistoryOpen(false);
    stayAtBottom.current = true;
    setShowJump(false);
  };

  const deleteSession = async (id: string) => {
    if (clearingRef.current || busy) return;
    clearingRef.current = true;
    setClearingHistory(true);
    setHistoryError(null);
    try {
      await pendingSync.current;
      await deleteConversation(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      if (selectedSessionId === id) setSelectedSessionId(null);
    } catch {
      setHistoryError("Could not delete this conversation. Please retry.");
    } finally {
      clearingRef.current = false;
      setClearingHistory(false);
    }
  };

  const clearAllSessions = async () => {
    if (!historyReady || clearingRef.current || busy || !sessions.length) return;
    clearingRef.current = true;
    setClearingHistory(true);
    setHistoryError(null);
    try {
      // A previously started autosave must finish before the workspace-wide
      // delete, or its late POST could recreate a cleared conversation.
      await pendingSync.current;
      await clearConversationHistory();
      saveChatHistory([]);
      setSessions([]);
      setSelectedSessionId(null);
      pendingRun.current = null;
      if (activeRun) dismissRun();
      setHistoryOpen(false);
    } catch {
      setHistoryError("Could not clear conversations. Nothing was deleted locally; please retry.");
    } finally {
      clearingRef.current = false;
      setClearingHistory(false);
    }
  };

  const stopCurrentRun = () => {
    if (activeRun) {
      setSessions((current) => current.map((session) => ({
        ...session,
        messages: session.messages.map((message) => message.run?.id === activeRun.id
          ? { ...message, run: { ...activeRun, status: "failed", failedTool: "cancelled by user" } }
          : message),
      })));
    }
    pendingRun.current = null;
    cancelRun();
  };

  const retryMessage = (sessionId: string, messageId: string) => {
    const message = sessions.find((session) => session.id === sessionId)?.messages.find((item) => item.id === messageId);
    if (!message?.run || busy) return;
    pendingRun.current = { sessionId, messageId };
    retryRun();
  };

  const onConversationScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    stayAtBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    setShowJump(!stayAtBottom.current);
  };

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-surface" aria-label="RivalPulse agent workspace">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-divider px-4 md:px-6">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-ink-2">
            {selectedSession?.title ?? "New investigation"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedSession ? (
            <button
              type="button"
              onClick={startNewChat}
              disabled={busy || chatPending || clearingHistory}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-field px-2.5 py-1.5 text-xs font-bold text-ink-2 transition-console hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus aria-hidden size={14} /> New chat
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-field border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-ink-2 transition-console hover:bg-subtle"
          >
            <History aria-hidden size={14} /> History
            {sessions.length ? <span className="rounded-full bg-subtle px-1.5 text-[10px] text-muted">{sessions.length}</span> : null}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onConversationScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth"
      >
        {selectedSession ? (
          <Conversation
            session={selectedSession}
            liveRunId={activeRun?.id}
            onCancel={stopCurrentRun}
            onRetry={retryMessage}
          />
        ) : (
          <Welcome
            loading={loading}
            companyNames={watchlist?.companies.map((company) => company.name) ?? []}
            onLaunch={launch}
          />
        )}
      </div>

      {showJump && selectedSession ? (
        <button
          type="button"
          onClick={() => {
            stayAtBottom.current = true;
            setShowJump(false);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          aria-label="Scroll to latest message"
          className="absolute bottom-[122px] left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-ink-2 shadow-sm transition-console hover:bg-subtle"
        >
          <ArrowDown aria-hidden size={15} />
        </button>
      ) : null}

      <div className="shrink-0 border-t border-divider bg-surface px-4 py-3 md:px-6 md:py-4">
        <div className="mx-auto w-full max-w-[860px]">
          {error ? (
            <div className="mb-2.5 flex items-center justify-between gap-3 rounded-field border border-accent-wash-border bg-accent-wash px-3 py-2 text-xs text-ink-2">
              <span>The agent could not reach its workspace data.</span>
              <button type="button" onClick={reload} className="cursor-pointer font-extrabold text-accent-ink hover:text-accent">Retry connection</button>
            </div>
          ) : null}
          <form onSubmit={submit} className="flex items-end gap-2 rounded-[16px] border border-neutral-300 bg-card p-2 shadow-[0_12px_32px_-24px_rgba(26,26,26,0.55)] transition-console focus-within:border-ink-2">
            <textarea
              autoFocus={!selectedSession}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy || chatPending || clearingHistory}
              rows={2}
              placeholder={busy ? "RivalPulse is investigating…" : "Ask a question or give a command…"}
              aria-label="Ask RivalPulse"
              className="max-h-36 min-h-13 flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] leading-[1.55] text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
            />
            <Button type="submit" variant="primary" size="sm" disabled={!draft.trim() || busy || chatPending || clearingHistory} aria-label="Send message">
              <Send aria-hidden size={15} strokeWidth={2.2} />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted">
            Simple workspace commands run instantly · research questions use the evidence pipeline
          </p>
        </div>
      </div>

      {historyOpen ? (
        <HistoryDrawer
          sessions={sessions}
          selectedId={selectedSessionId}
          busyRunId={busy ? activeRun?.id : undefined}
          onClose={() => setHistoryOpen(false)}
          onSelect={selectSession}
          onDelete={deleteSession}
          onClearAll={clearAllSessions}
          clearing={clearingHistory}
          clearError={historyError}
          onNew={startNewChat}
        />
      ) : null}
    </section>
  );
}

function Welcome({ loading, companyNames, onLaunch }: { loading: boolean; companyNames: string[]; onLaunch: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col justify-center px-5 py-10 md:px-10 md:py-12">
      <div className="max-w-[650px]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-detail border border-accent-wash-border bg-accent-wash"><Logo size={26} /></div>
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.13em] text-accent-ink">Cost-aware competitor agent</p>
        <h1 className="text-[clamp(27px,3.6vw,42px)] font-extrabold leading-[1.08] tracking-[-0.045em] text-ink">Ask a question—or give me a command.</h1>
        <p className="mt-3 max-w-[620px] text-[14px] leading-[1.7] text-muted">
          RivalPulse routes simple workspace changes instantly. Only analytical questions trigger planning, provider tools, comparison, and cited synthesis.
        </p>
      </div>

      <div className="mt-7 grid gap-2.5 md:grid-cols-3">
        {STARTERS.map((starter) => (
          <button key={starter.eyebrow} type="button" onClick={() => onLaunch(starter.prompt)} className="group cursor-pointer rounded-detail border border-border bg-card p-4 text-left transition-console hover:-translate-y-0.5 hover:border-neutral-300 active:translate-y-0">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-accent-ink">{starter.eyebrow}</span>
            <span className="mt-2 block text-[13px] font-bold leading-[1.5] text-ink-2">{starter.prompt}</span>
            <ArrowRight aria-hidden size={14} className="mt-3 text-muted transition-console group-hover:translate-x-1 group-hover:text-accent" />
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 font-bold text-ink-2"><FileSearch aria-hidden size={14} className="text-accent" /> Current scope</span>
        {loading ? <span>Loading watchlist…</span> : companyNames.length ? companyNames.map((name) => (
          <span key={name} className="rounded-full border border-divider bg-subtle px-2.5 py-1">{name}</span>
        )) : <Link href="/watchlists" className="font-bold text-accent-ink no-underline hover:text-accent">Add competitors first</Link>}
      </div>
    </div>
  );
}

function Conversation({ session, liveRunId, onCancel, onRetry }: { session: ChatSession; liveRunId?: string; onCancel: () => void; onRetry: (sessionId: string, messageId: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-7 md:px-8 md:py-9">
      {session.messages.map((message) => message.role === "user" ? (
        <div key={message.id} className="ml-auto max-w-[82%] rounded-detail rounded-tr-[4px] bg-ink-strong px-4 py-3 text-[14px] leading-[1.6] text-surface">
          {message.content}
        </div>
      ) : (
        <div key={message.id} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
          <span aria-hidden className={cx("flex h-8.5 w-8.5 items-center justify-center rounded-[11px] border border-accent-wash-border bg-accent-wash", message.run && message.run.id === liveRunId && ["queued", "running"].includes(message.run.status) && "animate-step-pulse")}>
            <Logo size={20} />
          </span>
          <AssistantMessage
            message={message}
            live={message.run?.id === liveRunId}
            onCancel={onCancel}
            onRetry={() => onRetry(session.id, message.id)}
          />
        </div>
      ))}
    </div>
  );
}

function AssistantMessage({ message, live, onCancel, onRetry }: { message: ChatMessage; live: boolean; onCancel: () => void; onRetry: () => void }) {
  if (message.kind === "instant") {
    return (
      <div className="max-w-[720px] rounded-detail border border-divider bg-card px-4 py-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-strong text-white"><Check size={11} strokeWidth={3} /></span>
          <span className="text-xs font-extrabold text-ink">{message.label}</span>
          <Pill tone="quiet" className="ml-auto">Instant action · no pipeline</Pill>
        </div>
        <p className="text-[13px] leading-[1.65] text-ink-2">{message.content}</p>
      </div>
    );
  }

  if (message.kind === "chat") {
    return (
      <div className="max-w-[720px] rounded-detail border border-divider bg-card px-4 py-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-subtle text-accent">
            {message.pending ? <LoaderCircle size={11} className="animate-spin" /> : <MessageSquareText size={11} />}
          </span>
          <span className="text-xs font-extrabold text-ink">RivalPulse</span>
          <Pill tone="quiet" className="ml-auto">Conversation · no credits</Pill>
        </div>
        <p
          className={cx("whitespace-pre-line text-[13px] leading-[1.65]", message.pending ? "text-muted" : "text-ink-2")}
          aria-live="polite"
        >
          {message.content}
        </p>
      </div>
    );
  }

  if (message.kind === "research") {
    if (!message.run) {
      return (
        <div className="max-w-[720px] rounded-detail border border-divider bg-card px-4 py-3.5">
          <div className="flex items-center gap-2 text-sm font-bold"><LoaderCircle size={14} className="animate-spin text-accent" /> Routing request</div>
          <p className="mt-2 text-xs leading-[1.6] text-muted">Classified as analytical. Preparing a bounded evidence plan…</p>
        </div>
      );
    }
    return <ResearchRunMessage run={message.run} live={live} onCancel={onCancel} onRetry={onRetry} />;
  }

  return <p className="max-w-[700px] text-[14px] leading-[1.7] text-ink-2">{message.content}</p>;
}

function ResearchRunMessage({ run, live, onCancel, onRetry }: { run: AgentRun; live: boolean; onCancel: () => void; onRetry: () => void }) {
  const busy = run.status === "queued" || run.status === "running";
  if (run.status === "failed") {
    return (
      <div className="max-w-[760px] rounded-detail border border-accent-wash-border bg-card p-4">
        <div className="flex items-center gap-2 font-bold text-ink"><X size={16} className="text-accent-ink" /> Investigation stopped</div>
        <p className="mt-2 text-[13px] leading-[1.6] text-muted">{runFailureMessage(run.failedTool)}</p>
        {live ? <button type="button" onClick={onRetry} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-field bg-accent px-3 py-2 text-xs font-bold text-white transition-console hover:bg-accent-hover"><RefreshCw size={13} /> Retry</button> : null}
      </div>
    );
  }

  if (run.status === "complete") {
    const produced = run.producedSignalIds?.length ?? 0;
    const partial = run.coverageStatus === "partial";
    return (
      <div className="max-w-[760px] rounded-detail border border-divider bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[14px] font-bold">
            <span className={cx("flex h-5 w-5 items-center justify-center rounded-full text-white", partial ? "bg-ink-2" : "bg-accent")}><Check size={12} strokeWidth={3} /></span>
            {partial ? "Investigation finished · limited coverage" : "Investigation complete"}
          </div>
          <Pill tone="neutral"><Clock3 size={11} className="mr-1 inline" />{clock(run.elapsedSeconds)}</Pill>
        </div>
        <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">{run.resultSummary ?? "The evidence was collected, validated, and stored."}</p>
        {run.financialBrief ? <FinancialEvidence brief={run.financialBrief} /> : null}
        <OrchestrationPanel run={run} bare />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
          <span className="text-xs text-muted">{run.financialBrief ? "Financial context only · no claims about recent competitor moves" : produced ? `${produced} evidence-backed ${produced === 1 ? "signal" : "signals"} published` : partial ? "Recent activity could not be verified; no conclusion about changes" : "No publishable changes in the available evidence"}</span>
          {produced ? <Link href="/signals" className="inline-flex items-center gap-1.5 text-xs font-extrabold text-accent-ink no-underline hover:text-accent">Review findings <ArrowRight size={13} /></Link> : null}
        </div>
      </div>
    );
  }

  const completed = Math.max(0, run.currentStep);
  const progress = run.steps.length ? Math.round((completed / run.steps.length) * 100) : 0;
  const currentLabel = run.steps[Math.max(0, run.currentStep)]?.label ?? "Preparing investigation";

  return (
    <div className="max-w-[780px] overflow-hidden rounded-detail border border-divider bg-card">
      <div className="border-b border-divider bg-subtle/55 px-4 py-3.5 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2"><Route size={14} className="text-accent" /><p className="text-[14px] font-bold">{run.status === "queued" ? "Preparing the investigation" : currentLabel}</p></div>
            <p className="mt-1 text-[11px] text-muted">Research workflow · {clock(run.elapsedSeconds)} elapsed</p>
          </div>
          <Pill tone="accent"><LoaderCircle size={11} className="mr-1 inline animate-spin" />Agent working</Pill>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label="Investigation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="rp-run-progress-active h-full rounded-full bg-accent transition-chart" style={{ width: `${Math.max(progress, 5)}%` }} />
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-4 md:px-5">
        {/* Column count follows the backend STAGES list; hardcoding it wrapped
            the rail onto a second row the moment a stage was added. */}
        <ol
          className="relative grid min-w-[620px] gap-2"
          style={{ gridTemplateColumns: `repeat(${run.steps.length}, minmax(0, 1fr))` }}
        >
          <span aria-hidden className="absolute top-[10px] right-[7%] left-[7%] h-0.5 bg-neutral-200" />
          {run.steps.map((step, index) => {
            const done = index < run.currentStep;
            const current = index === run.currentStep && run.status === "running";
            return (
              <li key={step.id} className="relative z-10 flex min-w-0 flex-col items-center text-center">
                <span className={cx(
                  "flex h-[22px] w-[22px] items-center justify-center rounded-full border-2",
                  done && "border-accent bg-accent text-white",
                  current && "border-accent bg-card text-accent shadow-step animate-step-pulse",
                  !done && !current && "border-neutral-200 bg-card text-neutral-300",
                )}>
                  {done ? <Check size={11} strokeWidth={3} /> : current ? <LoaderCircle size={11} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <span className={cx("mt-2 text-[10px] leading-[1.3]", current ? "font-extrabold text-ink" : done ? "font-bold text-ink-2" : "text-muted")}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <OrchestrationPanel run={run} />

      <div className="border-t border-divider px-4 py-3 md:px-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted">Tool calls</p>
        {run.toolCalls.length ? (
          <div className="mt-2 flex flex-col gap-1.5" aria-live="polite">
            {run.toolCalls.slice(-6).map((call, index) => (
              <div key={`${call.name}-${index}`} className="flex min-w-0 items-baseline gap-2 text-[11px]"><code className="shrink-0 font-bold text-accent-ink">{call.name}()</code><span className="truncate text-muted">{call.detail}</span></div>
            ))}
          </div>
        ) : <p className="mt-2 text-[11px] text-muted">Selecting the smallest sufficient set of approved tools…</p>}
        {live && busy ? <button type="button" onClick={onCancel} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-field border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-ink-2 transition-console hover:bg-subtle"><Square size={9} fill="currentColor" /> Stop run</button> : null}
      </div>
    </div>
  );
}

const ROUTE_LABEL: Record<string, string> = {
  competitive_activity: "Competitive activity",
  financial_statements: "Financial statements",
};

const INTERPRETER_FALLBACK = "AI wording rejected → reviewed wording";

const PLANNER_LABEL: Record<string, string> = {
  qwen: "Planned by Qwen",
  deterministic: "Deterministic plan",
  validated_fallback: "Qwen plan rejected → reviewed fallback",
};

/**
 * The decisions behind the answer: route, planner, spend, and what the agent
 * could not reach. A rejected model plan is shown, never quietly swapped.
 */
function OrchestrationPanel({ run, bare = false }: { run: AgentRun; bare?: boolean }) {
  const o = run.orchestration;
  if (!o || (!o.route && !o.toolCalls && !o.gaps?.length)) return null;

  const facts = [
    o.route ? ROUTE_LABEL[o.route] ?? o.route : null,
    o.planner ? PLANNER_LABEL[o.planner] ?? o.planner : null,
    o.interpreter === "validated_fallback" ? INTERPRETER_FALLBACK : null,
    o.toolCalls ? `${o.toolCalls} tool ${o.toolCalls === 1 ? "call" : "calls"}` : null,
    typeof o.credits === "number" ? `${o.credits} ${o.credits === 1 ? "credit" : "credits"}` : null,
    o.cacheHits ? `${o.cacheHits} cached` : null,
    o.comparedAgainstRunId ? `compared with run #${o.comparedAgainstRunId.slice(0, 8)}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className={bare ? "mt-4 border-t border-divider pt-4" : "border-t border-divider px-4 py-3 md:px-5"}>
      <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted">Agent decisions</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {facts.map((fact) => (
          <span
            key={fact}
            className={cx(
              "rounded-field border px-2 py-0.5 text-[10.5px] font-semibold",
              (o.planner === "validated_fallback" && fact.startsWith("Qwen plan rejected")) ||
                fact === INTERPRETER_FALLBACK
                ? "border-accent/40 bg-accent/10 text-accent-ink"
                : "border-divider bg-subtle/60 text-ink-2",
            )}
          >
            {fact}
          </span>
        ))}
      </div>
      {o.gaps?.length ? (
        <div className="mt-2.5">
          <p className="text-[10.5px] text-muted">
            {o.gapsClosed
              ? `Recovered ${o.gapsClosed} of ${o.gaps.length} evidence gaps`
              : `${o.gaps.length} evidence ${o.gaps.length === 1 ? "gap" : "gaps"} could not be closed`}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {o.gaps.map((gap) => (
              <li key={`${gap.symbol}-${gap.missing}`} className="flex min-w-0 items-baseline gap-2 text-[10.5px]">
                <span className="shrink-0 font-bold text-ink-2">{gap.symbol}</span>
                <span className="truncate text-muted">{gap.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FinancialEvidence({ brief }: { brief: NonNullable<AgentRun["financialBrief"]> }) {
  return (
    <div className="mt-4 border-t border-divider pt-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent-ink">Cited annual statements {brief.period ? `· ${brief.period}` : "· periods vary"}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {brief.rows.map((row) => (
          <div key={row.symbol} className="min-w-0 rounded-field border border-divider bg-subtle/50 p-3">
            <p className="text-xs font-extrabold text-ink">{row.symbol} <span className="font-medium text-muted">· {row.name}</span></p>
            {row.metrics.length ? row.metrics.map((metric) => (
              <div key={metric.claim_id} className="mt-3 text-xs">
                <p className="capitalize text-muted">{metric.metric} · {metric.period}</p>
                <p className="mt-0.5 break-words font-bold tabular-nums text-ink" title={`Provider value: ${metric.value} ${metric.currency ?? "currency not supplied"} (${metric.unit})`}>
                  {formatFinancialValue(metric.value, metric.currency)}
                </p>
                <a href={metric.source_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-bold text-accent-ink hover:text-accent" title={metric.json_pointer}>
                  {metric.source_url.includes("sectors.app") ? "Sectors report" : "Archived source"} ↗
                </a>
              </div>
            )) : <p className="mt-2 text-xs text-muted">No comparable annual figures available.</p>}
            {row.comparison_note !== "Reporting scope must be verified before growth comparisons." ? <p className="mt-2 text-[10px] leading-4 text-muted">{row.comparison_note}</p> : null}
          </div>
        ))}
      </div>
      {brief.interpretation ? <p className="mt-3 text-[12px] leading-[1.6] text-ink-2"><strong>AI hypothesis (uncertainty: {brief.interpretation.uncertainty}):</strong> {brief.interpretation.text}</p> : null}
      {brief.caveats.map((caveat) => <p key={caveat} className="mt-2 text-[11px] leading-[1.55] text-muted">{caveat}</p>)}
    </div>
  );
}

function formatFinancialValue(value: string, currency: string | null): string {
  const numeric = Number(value);
  const unit = currency ?? "Currency unspecified";
  // Compact IDR figures are explicitly approximate. The provider-native
  // amount remains available in the title and persisted snapshot.
  if (currency === "IDR" && Number.isSafeInteger(numeric)) {
    const absolute = Math.abs(numeric);
    const scale = absolute >= 1e12 ? 1e12 : absolute >= 1e9 ? 1e9 : 0;
    if (scale) return `${unit} ≈${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(numeric / scale)} ${scale === 1e12 ? "trillion" : "billion"}`;
  }
  return `${unit} ${value}`;
}

function HistoryDrawer({ sessions, selectedId, busyRunId, onClose, onSelect, onDelete, onClearAll, clearing, clearError, onNew }: { sessions: ChatSession[]; selectedId: string | null; busyRunId?: string; onClose: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onClearAll: () => Promise<void>; clearing: boolean; clearError: string | null; onNew: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="absolute inset-0 z-40 flex justify-end bg-ink/15" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="rp-drawer flex h-full w-full max-w-[340px] flex-col border-l border-border bg-sidebar shadow-[-20px_0_50px_-38px_rgba(26,26,26,0.5)]" aria-label="Chat history">
        <div className="flex h-[61px] items-center justify-between border-b border-border px-4">
          <div><p className="text-sm font-extrabold">Conversation history</p><p className="text-[11px] text-muted">Synced to this workspace</p></div>
          <button type="button" onClick={onClose} aria-label="Close history" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-field text-muted transition-console hover:bg-subtle hover:text-ink"><X size={16} /></button>
        </div>
        <div className="p-3">
          <button type="button" onClick={onNew} disabled={Boolean(busyRunId)} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field bg-ink-strong px-3 py-2.5 text-xs font-bold text-white transition-console hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45"><Plus size={14} /> New conversation</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessions.length ? sessions.map((session) => {
            return (
              <div key={session.id} className={cx("group flex items-start gap-1 rounded-field p-1", selectedId === session.id && "bg-card")}>
                <button type="button" onClick={() => onSelect(session.id)} className="min-w-0 flex-1 cursor-pointer rounded-[8px] px-2.5 py-2 text-left transition-console hover:bg-card">
                  <span className="block truncate text-xs font-bold text-ink-2">{session.title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted"><MessageSquareText size={11} /> {session.messages.length} messages · {formatHistoryTime(session.updatedAt)}</span>
                </button>
                <button type="button" onClick={() => { void onDelete(session.id); }} disabled={Boolean(busyRunId) || clearing} aria-label={`Delete conversation: ${session.title}`} title="Delete conversation" className="mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-muted transition-console hover:bg-accent-wash hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} /></button>
              </div>
            );
          }) : (
            <div className="px-4 py-10 text-center"><History size={20} className="mx-auto text-neutral-300" /><p className="mt-2 text-xs font-bold text-ink-2">No conversations yet</p><p className="mt-1 text-[11px] leading-[1.5] text-muted">Your commands and investigations will appear here.</p></div>
          )}
        </div>
        {sessions.length ? (
          <div className="shrink-0 border-t border-border p-3">
            {confirmClear ? (
              <div className="rounded-field border border-accent-wash-border bg-accent-wash p-3">
                <p className="text-xs font-bold text-ink">Clear all {sessions.length} conversations?</p>
                <p className="mt-1 text-[11px] leading-[1.5] text-ink-2">This removes chat transcripts from this workspace and browser. Stored investigations and evidence remain.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => { void onClearAll(); }} disabled={Boolean(busyRunId) || clearing} className="cursor-pointer rounded-field bg-accent px-3 py-2 text-xs font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{clearing ? "Clearing…" : "Yes, clear all"}</button>
                  <button type="button" onClick={() => setConfirmClear(false)} disabled={clearing} className="cursor-pointer rounded-field px-3 py-2 text-xs font-bold text-ink-2 hover:bg-card disabled:cursor-not-allowed">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} disabled={Boolean(busyRunId) || clearing} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field px-3 py-2 text-xs font-bold text-muted transition-console hover:bg-accent-wash hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} /> Clear all conversations</button>
            )}
            {clearError ? <p role="alert" className="mt-2 text-xs text-accent-ink">{clearError}</p> : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function conversationTitle(prompt: string): string {
  return prompt.length > 58 ? `${prompt.slice(0, 57).trimEnd()}…` : prompt;
}

function mergeHistories(local: ChatSession[], remote: ChatSession[]): ChatSession[] {
  const merged = new Map<string, ChatSession>();
  for (const session of [...local, ...remote]) {
    const current = merged.get(session.id);
    if (!current || session.updatedAt > current.updatedAt) merged.set(session.id, session);
  }
  return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
