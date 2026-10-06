"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Clock3,
  FileSpreadsheet,
  History,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Route,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { AgentPrompt } from "./AgentPrompt";
import { AgentControls } from "./AgentControls";
import { promptSuggestions } from "@/lib/prompt-suggestions";
import { FinancialHistoryChart } from "@/components/dashboard/FinancialHistoryChart";
import { Pill, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { clock, formatFinancial, prettyBriefKind, BRIEF_KINDS, runFailureMessage } from "@/lib/format";
import { routeMessage, detectLanguage } from "@/lib/agent-router";
import {
  type ChatMessage,
  type ChatSession,
  loadChatHistory,
  newId,
  persistable,
  saveChatHistory,
} from "@/lib/chat-history";
import type { AgentRun, Signal } from "@/lib/types";
import { downloadRunXls } from "@/lib/export-xls";
import { type ChatTurn, clearConversationHistory, deleteConversation, getConversationHistory, saveConversation, sendChat } from "@/lib/api";

interface PendingRun {
  sessionId: string;
  messageId: string;
}

export function AgentWorkspace({ initialPrompt = "" }: { initialPrompt?: string }) {
  const store = useStore();
  const {
    activeRun,
    watchlist,
    signals,
    aggregates,
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
  const { setOurCompany, storageScope } = store;
  const [draft, setDraft] = useState(initialPrompt);
  const [composerVersion, setComposerVersion] = useState(0);
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
      const local = loadChatHistory(storageScope);
      getConversationHistory().then((remote) => {
        if (!active) return;
        const stored = storageScope ? remote : mergeHistories(local, remote);
        setSessions(stored);
        setSelectedSessionId(stored[0]?.id ?? null);
        setHistoryReady(true);
      }).catch(() => {
        if (active) setHistoryError("Could not load saved conversations. Reload to try again.");
      });
    });
    return () => { active = false; };
  }, [storageScope]);

  useEffect(() => {
    if (!historyReady || clearingRef.current) return;
    saveChatHistory(sessions, storageScope);
    const timer = window.setTimeout(() => {
      if (!clearingRef.current) pendingSync.current = Promise.all(sessions.map((session) => saveConversation(persistable(session))))
        .then(() => setHistoryError(null))
        .catch(() => { setHistoryError("Conversation changes could not be saved. Check your connection, then send another message to retry."); });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [historyReady, sessions, storageScope]);

  // Attach every streamed run update to the research message that started it.
  // This turns the conversation itself into durable local history instead of
  // showing progress in a disconnected card that disappears on navigation.
  // pendingRun is a ref, so it is lost when this component unmounts (route or
  // tab switch) while the store-owned stream keeps running. On re-link the
  // newest run-less research message belonging to the live run is adopted, so
  // progress keeps attaching instead of completing invisibly.
  useEffect(() => {
    if (!activeRun) return;
    if (!pendingRun.current && (activeRun.status === "queued" || activeRun.status === "running")) {
      const now = new Date().toISOString();
      let adopted: PendingRun | null = null;
      setSessions((current) => {
        if (current.some((s) => s.messages.some((m) => m.run?.id === activeRun.id))) return current;
        let best: { sessionId: string; messageId: string; createdAt: string } | null = null;
        for (const session of current) {
          for (const message of session.messages) {
            if (message.role === "assistant" && message.kind === "research" && !message.run) {
              if (!best || message.createdAt > best.createdAt) {
                best = { sessionId: session.id, messageId: message.id, createdAt: message.createdAt };
              }
            }
          }
        }
        if (!best) return current;
        adopted = { sessionId: best.sessionId, messageId: best.messageId };
        return current.map((session) => session.id === best.sessionId
          ? {
              ...session,
              messages: session.messages.map((message) => message.id === best.messageId
                ? { ...message, run: activeRun }
                : message),
              updatedAt: now,
            }
          : session);
      });
      if (adopted) pendingRun.current = adopted;
    }
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
  // Layout effect, not passive effect: the scroll position is set before the
  // browser paints, so opening the tab never flashes the top of the chat
  // before jumping to the bottom.
  useLayoutEffect(() => {
    if (!stayAtBottom.current) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = selectedSessionId ? element.scrollHeight : 0;
  }, [scrollSignature, selectedSessionId]);

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

  const answerLocalCommand = (clean: string, sessionId: string, userMessage: ChatMessage): boolean => {
    // Session controls. Read-only except stop, which only ever cancels the
    // run already in flight — never anything else.
    const lang = detectLanguage(clean);
    const id = lang === "id";
    if (/^(stop|cancel|stop (it|this|the run)|berhenti|batal(kan)?|stop run)\s*[?.!]*$/i.test(clean)) {
      if (busy) {
        if (selectedSessionId) {
          setSelectedSessionId(sessionId);
          appendMessages(sessionId, [userMessage], conversationTitle(clean));
        }
        setDraft("");
        stopCurrentRun();
      } else {
        setSelectedSessionId(sessionId);
        setDraft("");
        appendMessages(sessionId, [userMessage, {
          id: newId(), role: "assistant", kind: "instant",
          content: id ? "Tidak ada investigasi yang berjalan — tidak ada yang dihentikan." : "No investigation running — nothing to stop.",
          label: id ? "Perintah instan" : "Instant action",
          createdAt: new Date().toISOString(),
        }], conversationTitle(clean));
      }
      return true;
    }
    if (/^(retry|try again|coba lagi|ulangi)\s*[?.!]*$/i.test(clean)) {
      const failed = activeRun && activeRun.status === "failed" ? activeRun : null;
      setSelectedSessionId(sessionId);
      setDraft("");
      if (failed) {
        appendMessages(sessionId, [userMessage], conversationTitle(clean));
        retryRun();
      } else {
        appendMessages(sessionId, [userMessage, {
          id: newId(), role: "assistant", kind: "instant",
          content: id ? "Tidak ada investigasi gagal yang bisa diulang." : "No failed investigation to retry.",
          label: id ? "Perintah instan" : "Instant action",
          createdAt: new Date().toISOString(),
        }], conversationTitle(clean));
      }
      return true;
    }
    if (/^(new chat|new conversation|chat baru|mulai baru)\s*[?.!]*$/i.test(clean)) {
      startNewChat();
      return true;
    }

    // Instant, read-only workspace answers. No pipeline, no credits, safe to
    // ask mid-investigation (the composer stays locked while busy, but these
    // also fire from suggestion bubbles and typed commands when idle).
    const sayIt = (en: string, idText: string) => {
      setSelectedSessionId(sessionId);
      setDraft("");
      appendMessages(sessionId, [userMessage, {
        id: newId(), role: "assistant", kind: "instant", content: id ? idText : en,
        label: id ? "Perintah instan" : "Instant action",
        createdAt: new Date().toISOString(),
      }], conversationTitle(clean));
    };

    if (/^(status|stats|what'?s (running|happening|going on)|status(nya| run| investigasi)?|lagi (jalan|ngapain|running))\s*[?.!]*$/i.test(clean)) {
      const live = activeRun && (activeRun.status === "queued" || activeRun.status === "running") ? activeRun : null;
      const step = live
        ? live.steps[Math.max(0, live.currentStep)]?.label ?? (live.status === "queued" ? "Queued" : "Working")
        : null;
      sayIt(
        live
          ? `Running: “${live.query}” — ${step} · ${clock(live.elapsedSeconds)} elapsed. Safe to switch tabs; I keep working.`
          : "No investigation running right now. Ask me to compare or research something whenever ready.",
        live
          ? `Sedang berjalan: “${live.query}” — ${step} · ${clock(live.elapsedSeconds)} berlalu. Aman ganti tab; saya lanjut bekerja.`
          : "Tidak ada investigasi yang berjalan saat ini. Minta saya membandingkan atau meneliti sesuatu kapan pun siap.",
      );
      return true;
    }

    if (/^(credits?|sisa kredit|kredit|usage|pemakaian)\s*[?.!]*$/i.test(clean)) {
      sayIt(
        aggregates
          ? `Research allowance: ${aggregates.credits.availablePercent}% remaining · ${aggregates.credits.available} research credits available · ${Math.round(aggregates.credits.cacheHitRate * 100)}% cache hits. Each investigation is capped; digests cost nothing.`
          : "Credit data is still loading. Try again in a moment.",
        aggregates
          ? `Sisa alokasi riset: ${aggregates.credits.availablePercent}% · ${aggregates.credits.available} kredit riset tersedia · ${Math.round(aggregates.credits.cacheHitRate * 100)}% cache hit. Setiap investigasi dibatasi; email tidak memakai kredit.`
          : "Data kredit masih dimuat. Coba lagi sebentar lagi.",
      );
      return true;
    }

    if (/^(export(\s+(xls|excel|last( result)?|terakhir))?|ekspor(\s+(terakhir|xls))?)\s*[?.!]*$/i.test(clean)) {
      const done = [...sessions.flatMap((session) => session.messages)]
        .filter((message) => message.kind === "research" && message.run?.status === "complete")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!done?.run) {
        sayIt(
          "No completed investigation yet — run one first, then ask me to export it.",
          "Belum ada investigasi yang selesai — jalankan dulu, lalu minta saya mengekspornya.",
        );
        return true;
      }
      downloadRunXls(done.run, signals);
      sayIt(
        `Exported investigation “${conversationTitle(done.run.query)}” as .xls — check your downloads.`,
        `Investigasi “${conversationTitle(done.run.query)}” sudah diekspor sebagai .xls — periksa unduhan Anda.`,
      );
      return true;
    }

    return false;
  };

  const launch = (query: string) => {
    const clean = query.trim();
    if (!clean || !historyReady || chatPending || clearingRef.current) return;

    stayAtBottom.current = true;
    setShowJump(false);
    const sessionId = selectedSessionId ?? newId();
    const now = new Date().toISOString();
    const userMessage: ChatMessage = { id: newId(), role: "user", kind: "text", content: clean, createdAt: now };

    // Read-only local commands work even mid-run: they touch no pipeline,
    // spend nothing, and never disturb the active investigation.
    if (answerLocalCommand(clean, sessionId, userMessage)) return;
    if (busy) return;

    const route = routeMessage(clean, watchlist);

    setSelectedSessionId(sessionId);
    setDraft("");

    if (route.kind === "instant") {
      if (route.action?.type === "add_companies") addCompanies(route.action.companies);
      if (route.action?.type === "remove_companies") removeCompanies(route.action.tickers);
      if (route.action?.type === "rename_watchlist") renameWatchlist(route.action.name);
      if (route.action?.type === "set_our_company") setOurCompany(route.action.ticker);
      appendMessages(sessionId, [userMessage, {
        id: newId(), role: "assistant", kind: "instant", content: route.content,
        label: route.label, createdAt: new Date().toISOString(), suggestions: route.suggestions,
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
      const settle = (content: string, label?: string) => setSessions((current) => current.map((session) => ({
        ...session,
        updatedAt: session.id === sessionId ? new Date().toISOString() : session.updatedAt,
        messages: session.messages.map((message) => message.id === replyId
          ? { ...message, content, label, pending: false, createdAt: new Date().toISOString() }
          : message),
      })));
      sendChat(clean, history)
        .then((reply) => settle(reply.reply, reply.source === "llm" ? "AI response" : reply.source === "fallback" ? "Assistant unavailable" : "Research guidance"))
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
    void startRun(clean, (reason) => {
      if (pendingRun.current?.messageId === assistantId) pendingRun.current = null;
      setSessions((current) => current.map((session) => session.id === sessionId ? {
        ...session, messages: session.messages.map((message) => message.id === assistantId
          ? { ...message, kind: "chat", label: "Research unavailable", content: reason }
          : message),
      } : session));
    });
  };

  const startNewChat = () => {
    if (!historyReady || busy || chatPending || clearingRef.current) return;
    dismissRun();
    setSelectedSessionId(null);
    setDraft("");
    setComposerVersion((value) => value + 1);
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
      saveChatHistory([], storageScope);
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

  const stopCurrentRun = async () => {
    const stopped = await cancelRun();
    if (!stopped) return;
    if (activeRun) {
      setSessions((current) => current.map((session) => ({
        ...session,
        messages: session.messages.map((message) => message.run?.id === activeRun.id
          ? { ...message, run: { ...activeRun, status: "failed", failedTool: "cancelled by user" } }
          : message),
      })));
    }
    pendingRun.current = null;
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

  const composerProps = {
    suggestions: promptSuggestions(watchlist, signals),
    draft,
    onDraftChange: setDraft,
    onSend: launch,
    disabled: !historyReady || busy || chatPending || clearingHistory,
    working: busy || chatPending,
    notices: <>
      {historyError ? (
        <div role="alert" className="mb-2.5 rounded-field border border-accent-wash-border bg-accent-wash px-3 py-2 text-xs text-ink-2">{historyError}</div>
      ) : null}
      {error ? (
        <div role="alert" className="mb-2.5 flex items-center justify-between gap-3 rounded-field border border-accent-wash-border bg-accent-wash px-3 py-2 text-xs text-ink-2">
          <span>The agent could not reach its workspace data.</span>
          <button type="button" onClick={reload} className="cursor-pointer font-extrabold text-accent-ink hover:text-accent">Retry connection</button>
        </div>
      ) : null}
    </>,
  };

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#F3F7F5]" aria-label="RivalPulse agent workspace">
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-5 pb-3 md:px-6">
        <div className="min-w-0"><h1 className="text-[clamp(17px,2vw,22px)] font-bold leading-snug tracking-tight">What would you like to know today?</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{selectedSession?.title ?? "Explore your watchlist with cited research."}</p></div>
        <AgentControls blocked={!historyReady || busy || chatPending || clearingHistory} onNew={startNewChat} onHistory={() => setHistoryOpen(true)} />
      </header>

      <div
        ref={scrollRef}
        onScroll={onConversationScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {selectedSession ? (
          <Conversation
            session={selectedSession}
            liveRunId={activeRun?.id}
            onCancel={stopCurrentRun}
            onRetry={retryMessage}
            onLaunch={setDraft}
          />
        ) : (
          <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-8"><p className="max-w-[55ch] text-sm leading-relaxed text-muted">Ask a question about your competitors, review recent findings, or compare reported financial performance.</p></div>
        )}
      </div>

      <div className="relative z-10 max-h-[55%] shrink-0 overflow-y-auto px-4 pb-3 pt-2 md:px-6 md:pb-4">
        {showJump && selectedSession ? (
        <button
          type="button"
          onClick={() => {
            stayAtBottom.current = true;
            setShowJump(false);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          }}
          aria-label="Scroll to latest message"
          className="absolute -top-11 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-ink-2 shadow-sm transition-console hover:bg-subtle"
        >
          <ArrowDown aria-hidden size={15} />
        </button>
        ) : null}
        <AgentPrompt key={selectedSession?.id ?? composerVersion} {...composerProps} />
      </div>

      {historyOpen ? (
        <HistoryDrawer
          sessions={sessions}
          selectedId={selectedSessionId}
          blocked={busy || chatPending || !historyReady}
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

function Conversation({ session, liveRunId, onCancel, onRetry, onLaunch }: { session: ChatSession; liveRunId?: string; onCancel: () => void; onRetry: (sessionId: string, messageId: string) => void; onLaunch: (prompt: string) => void }) {
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
            onLaunch={onLaunch}
          />
        </div>
      ))}
    </div>
  );
}

function AssistantMessage({ message, live, onCancel, onRetry, onLaunch }: { message: ChatMessage; live: boolean; onCancel: () => void; onRetry: () => void; onLaunch: (prompt: string) => void }) {
  if (message.kind === "instant") {
    return (
      <div className="max-w-[720px] rounded-detail border border-divider bg-card px-4 py-3.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-strong text-white"><Check size={11} strokeWidth={3} /></span>
          <span className="text-xs font-extrabold text-ink">{message.label === "Instant action" ? "Workspace update" : message.label === "Perintah instan" ? "Pembaruan workspace" : message.label}</span>
        </div>
        <p className="text-[13px] leading-[1.65] text-ink-2">{message.content}</p>
        {message.suggestions && message.suggestions.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Suggested follow-ups">
            {message.suggestions.map((suggestion) => (
              <button
                key={`${suggestion.label}::${suggestion.prompt}`}
                type="button"
                onClick={() => onLaunch(suggestion.prompt)}
                className="cursor-pointer rounded-full border border-accent-wash-border bg-accent-wash px-3 py-1.5 text-xs font-bold text-accent-ink transition-console hover:bg-accent hover:text-white active:scale-95"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : null}
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
          <Pill tone="quiet" className="ml-auto">{message.label === "Assistant unavailable · fallback" ? "Assistant unavailable" : message.label === "Verified scope guard" ? "Research guidance" : message.label === "AI reply" ? "AI response" : message.label ?? "Conversation"}</Pill>
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
          <div className="flex items-center gap-2 text-sm font-bold"><LoaderCircle size={14} className="animate-spin text-accent" /> Preparing your research</div>
          <p className="mt-2 text-xs leading-[1.6] text-muted">Reviewing your question and selecting relevant sources…</p>
        </div>
      );
    }
    return <ResearchRunMessage run={message.run} live={live} onCancel={onCancel} onRetry={onRetry} />;
  }

  return <p className="max-w-[700px] text-[14px] leading-[1.7] text-ink-2">{message.content}</p>;
}

function SignalLinkList({ items, total }: { items: Signal[]; total: number }) {
  return (
    <>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((signal) => (
          <li key={signal.id} className="text-[13px] leading-[1.5]">
            <Link href={`/signals/${signal.id}`} title={signal.headline} className="font-bold text-accent-ink no-underline hover:text-accent">
              <span className="break-words">{signal.headline.startsWith(signal.company) ? signal.headline : `${signal.company} · ${signal.headline}`}</span>
            </Link>
            <span className="text-muted"> — {signal.type}, {signal.severity} severity</span>
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <Link href="/signals" className="mt-2 inline-block text-[12px] font-bold text-accent-ink no-underline hover:text-accent">
          …and {total - items.length} more in Signals
        </Link>
      ) : null}
    </>
  );
}

function ResearchRunMessage({ run, live, onCancel, onRetry }: { run: AgentRun; live: boolean; onCancel: () => void; onRetry: () => void }) {
  const busy = run.status === "queued" || run.status === "running";
  const { signals } = useStore();
  if (run.status === "failed") {
    return (
      <div className="max-w-[760px] rounded-detail border border-accent-wash-border bg-card p-4">
        <div className="flex items-center gap-2 font-bold text-ink"><X size={16} className="text-accent-ink" /> {run.failedTool === "CANCELLED" || run.failedTool === "cancelled by user" ? "Investigation stopped" : "Research could not finish"}</div>
        <p className="mt-2 text-[13px] leading-[1.6] text-muted">{runFailureMessage(run.failedTool)}</p>
        <p className="mt-1.5 font-mono text-[11px] text-muted">
          Support reference: {run.id.slice(0, 8)}
        </p>
        {live ? <button type="button" onClick={onRetry} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-field bg-accent px-3 py-2 text-xs font-bold text-white transition-console hover:bg-accent-hover"><RefreshCw size={13} /> Retry</button> : null}
      </div>
    );
  }

  if (run.status === "complete") {
    const produced = run.producedSignalIds?.length ?? 0;
    const partial = run.coverageStatus === "partial";
    // Baselines belong to this run too: match stored signals by run id so a
    // first investigation shows its comparison instead of a dead end.
    const runSignals = signals.filter((s) => s.runId === run.id);
    const baselineCount = runSignals.filter((s) => !run.producedSignalIds?.includes(s.id)).length;
    const shown = runSignals.slice(0, 6);
    // A comparison that published nothing new still answers better with the
    // relevant stored signals for the compared companies — but only then, so
    // fresh findings are never duplicated below.
    const comparedSymbols = run.financialBrief ? run.financialBrief.rows.map((r) => r.symbol) : [];
    const relevantSignals =
      runSignals.length === 0 && comparedSymbols.length > 0
        ? signals.filter((s) => comparedSymbols.includes(s.company)).slice(0, 6)
        : [];
    const relevantTotal =
      runSignals.length === 0 && comparedSymbols.length > 0
        ? signals.filter((s) => comparedSymbols.includes(s.company)).length
        : 0;
    return (
      <div className="max-w-[760px] rounded-detail border border-divider bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[14px] font-bold">
            <span className={cx("flex h-5 w-5 items-center justify-center rounded-full text-white", partial ? "bg-ink-2" : "bg-accent")}><Check size={12} strokeWidth={3} /></span>
            {partial ? "Research complete · coverage gaps" : "Research complete"}
          </div>
          <Pill tone="neutral"><Clock3 size={11} className="mr-1 inline" />{clock(run.elapsedSeconds)}</Pill>
        </div>
        <p className="mt-3 text-[14px] leading-[1.7] text-ink-2">{run.resultSummary ?? "The evidence was collected, validated, and stored."}</p>
        <details className="mt-4 rounded-detail border border-divider bg-subtle/50 p-3.5">
          <summary className="cursor-pointer text-xs font-bold text-ink-2">Source coverage{partial ? " · gaps remain" : " · review evidence"}</summary>
          <p className="mt-3 text-xs leading-relaxed text-muted">{partial ? "Some evidence could not be verified. The available findings remain saved; review their sources before using them." : "Research reflects the sources available at the time of the investigation. Open a finding to review its evidence."}</p>
          {run.orchestration?.gaps?.length ? <ul className="mt-3 flex flex-col gap-2">{run.orchestration.gaps.map((gap, index) => <li key={`${gap.symbol}-${gap.missing}-${index}`} className="text-xs leading-relaxed text-ink-2"><strong>{gap.symbol}</strong> — {gap.missing === "financial" ? "Financial statements unavailable or incomplete" : gap.missing === "public_events" ? "Recent company activity could not be fully verified" : "Supporting evidence unavailable or incomplete"}</li>)}</ul> : null}
          <Link href="/signals" className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-accent-ink no-underline hover:text-accent">Review finding sources <ArrowRight aria-hidden size={13} /></Link>
        </details>
        {run.financialBrief ? <FinancialEvidence brief={run.financialBrief} /> : null}
        {shown.length > 0 ? (
          <div className="mt-4 border-t border-divider pt-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
              Findings in this run ({runSignals.length})
            </p>
            <SignalLinkList items={shown} total={runSignals.length} />
          </div>
        ) : null}
        {relevantSignals.length > 0 ? (
          <div className="mt-4 border-t border-divider pt-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted">
              Relevant signals for the compared companies ({relevantTotal})
            </p>
            <SignalLinkList items={relevantSignals} total={relevantTotal} />
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
          <span className="text-xs text-muted">{run.financialBrief && run.orchestration?.route === "financial_statements" ? "Financial context only · no claims about recent competitor moves" : produced ? `${produced} evidence-backed ${produced === 1 ? "signal" : "signals"} published` : partial ? "Some sources were unavailable. Review coverage and each finding’s evidence." : baselineCount ? `${baselineCount} baseline ${baselineCount === 1 ? "observation" : "observations"} recorded — the reference for future runs` : signals.length > 0 ? "No new findings in this run — previously observed findings are in Signals" : run.financialBrief ? "No new announcements; cited annual comparison below" : "No publishable changes in the available evidence"}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadRunXls(run, signals)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-field border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-ink-2 transition-console hover:bg-subtle"
              title="Download this result as .xls"
            >
              <FileSpreadsheet size={13} /> Export XLS
            </button>
            {produced || runSignals.length ? <Link href="/signals" className="inline-flex items-center gap-1.5 text-xs font-extrabold text-accent-ink no-underline hover:text-accent">Review findings <ArrowRight size={13} /></Link> : null}
          </div>
        </div>
        {run.financialBrief || run.orchestration?.route === "financial_statements" || /\b(revenue|earnings|financial|profit|pendapatan|keuangan|laba)\b/i.test(run.query) ? <div className="mt-5 border-t border-divider pt-5"><FinancialHistoryChart series={run.financialBrief ? run.financialBrief.rows.map((row) => ({ company: row.symbol, note: row.comparison_note,
          points: (row.revenue_history.length ? row.revenue_history : row.metrics.filter((metric) => metric.metric === "revenue")).map((metric) => ({ ...metric, basis: metric.comparison_basis, sourceUrl: metric.source_url, snapshotId: metric.snapshot_id })) })) : [...new Set(runSignals.map((signal) => signal.company))].map((company) => ({ company, points: runSignals.filter((signal) => signal.company === company).flatMap((signal) => signal.financialContext.rows?.filter((row) => row.metric === "revenue") ?? []) }))} /></div> : null}
      </div>
    );
  }

  const completed = Math.max(0, run.currentStep);
  const progress = run.steps.length ? Math.round((completed / run.steps.length) * 100) : 0;
  const currentLabel = researchStage(run.steps[Math.max(0, run.currentStep)]?.label ?? "Preparing investigation");

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
                <span className={cx("mt-2 text-[10px] leading-[1.3]", current ? "font-extrabold text-ink" : done ? "font-bold text-ink-2" : "text-muted")}>{researchStage(step.label)}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t border-divider px-4 py-3 md:px-5">
        <p className="text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted">Research activity</p>
        {run.toolCalls.length ? (
          <div className="mt-2 flex flex-col gap-1.5" aria-live="polite">
            {run.toolCalls.slice(-6).map((call, index) => (
              <div key={`${call.name}-${index}`} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11px]"><span className="font-bold text-accent-ink">{researchActivity(call.name)}</span><span className="break-words text-muted">{call.detail}</span></div>
            ))}
          </div>
        ) : <p className="mt-2 text-[11px] text-muted">Selecting relevant sources…</p>}
        {live && busy ? <button type="button" onClick={onCancel} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-field border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold text-ink-2 transition-console hover:bg-subtle"><Square size={9} fill="currentColor" /> Stop run</button> : null}
      </div>
    </div>
  );
}

function researchStage(label: string): string {
  const labels: Record<string, string> = { validate: "Check request", plan: "Select sources", collect: "Gather evidence", recover: "Review gaps", compare: "Compare findings", analyze: "Analyze findings", validateoutput: "Verify evidence", "validate output": "Verify evidence", persist: "Save results" };
  return labels[label.toLowerCase()] ?? label;
}

function researchActivity(name: string): string {
  const labels: Record<string, string> = { get_company_overview: "Company overview", get_financial_statements: "Financial statements", get_company_news: "Company news", get_recent_signals: "Previous findings", fetch_public_source: "Company sources", sectors_company_report: "Company financials", sectors_company_news: "Company news" };
  return labels[name] ?? name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function FinancialEvidence({ brief }: { brief: NonNullable<AgentRun["financialBrief"]> }) {
  return (
    <div className="mt-4 border-t border-divider pt-4">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-accent-ink">Cited annual statements {brief.period ? `· ${brief.period}` : "· periods vary"}</p>
      <ComparisonTable brief={brief} />
      <p className="mt-2 text-[10px] leading-4 text-muted">
        Verified IDR figures use trillions. Hover to inspect the source scale, or open the cited report for its original values.
      </p>
      {brief.rows.map((row) =>
        row.comparison_note !== "Reporting scope must be verified before growth comparisons." ? (
          <p key={row.symbol} className="mt-2 text-[10px] leading-4 text-muted">
            <strong>{row.symbol}:</strong> {row.comparison_note}
          </p>
        ) : null,
      )}
      {brief.interpretation ? <p className="mt-3 text-[12px] leading-[1.6] text-ink-2"><strong>AI hypothesis (uncertainty: {brief.interpretation.uncertainty}):</strong> {brief.interpretation.text}</p> : null}
      {brief.caveats.map((caveat) => <p key={caveat} className="mt-2 text-[11px] leading-[1.55] text-muted">{caveat}</p>)}
    </div>
  );
}

/**
 * Side-by-side statement comparison: one table, companies as columns, so a
 * "compare" answer actually compares instead of stacking per-company cards.
 * Every cell links its cited source; missing cells say so instead of hiding.
 */
function ComparisonTable({ brief }: { brief: NonNullable<AgentRun["financialBrief"]> }) {
  const { watchlist } = useStore();
  const ours = watchlist?.user_company ?? null;
  const present = BRIEF_KINDS.filter((kind) =>
    brief.rows.some((row) => row.metrics.some((metric) => metric.metric === kind)),
  );
  const periods = [...new Set(
    brief.rows.flatMap((row) => row.metrics.map((metric) => metric.period)),
  )].sort().reverse();
  const lookup = new Map(
    brief.rows.flatMap((row) =>
      row.metrics.map((metric) => [`${row.symbol}|${metric.metric}|${metric.period}`, metric] as const),
    ),
  );

  if (!present.length || !periods.length) {
    return <p className="mt-3 text-xs text-muted">No comparable annual figures available.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-field border border-divider">
      <table className="w-full min-w-[480px] border-collapse text-xs">
        <thead>
          <tr className="bg-subtle/70">
            <th className="px-3 py-2 text-left font-bold text-muted">Metric · Period</th>
            {brief.rows.map((row) => (
              <th key={row.symbol} title={`${row.name}${ours === row.symbol ? " (your company)" : ""}`} className="px-3 py-2 text-right font-extrabold text-ink">
                {row.symbol}{ours === row.symbol ? " ★" : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {present.map((kind) =>
            periods.map((period) => (
              <tr key={`${kind}-${period}`} className="border-t border-divider">
                <td className="px-3 py-2 capitalize text-muted">{prettyBriefKind(kind)} · {period}</td>
                {brief.rows.map((row) => {
                  const metric = lookup.get(`${row.symbol}|${kind}|${period}`);
                  if (!metric) return <td key={row.symbol} className="px-3 py-2 text-right text-muted">—</td>;
                  const full = `${formatFinancial(metric)} · source scale: ${metric.unit}`;

                  return (
                    <td key={row.symbol} className="px-3 py-2 text-right tabular-nums" title={full}>
                      <span className="font-bold text-ink">{formatFinancial(metric)}</span>
                      <Link
                        href={`/financial-sources/${metric.snapshot_id}`}
                        aria-label={`View ${row.symbol} ${prettyBriefKind(kind)} ${period} financial source`}
                        onClick={(event) => event.stopPropagation()}
                        title={`Cited source: ${metric.json_pointer}`}
                        className="ml-1 font-bold text-accent-ink no-underline hover:text-accent"
                      >
                        ↗
                      </Link>
                    </td>
                  );
                })}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryDrawer({ sessions, selectedId, blocked, onClose, onSelect, onDelete, onClearAll, clearing, clearError, onNew }: { sessions: ChatSession[]; selectedId: string | null; blocked?: boolean; onClose: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void; onClearAll: () => Promise<void>; clearing: boolean; clearError: string | null; onNew: () => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestClose = useCallback(() => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
  }, [onClose]);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useFocusTrap(panel, requestClose, true);
  return createPortal(
    <div className={cx("rp-fade fixed inset-0 z-50 flex justify-end bg-ink/20", closing && "rp-fade-out")} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <aside ref={panel} role="dialog" aria-modal="true" tabIndex={-1} className={cx("rp-drawer-right flex h-full w-full max-w-[340px] flex-col border-l border-border bg-sidebar shadow-[-20px_0_50px_-38px_rgba(26,26,26,0.5)]", closing && "rp-drawer-right-out")} aria-label="Chat history">
        <div className="flex h-[61px] items-center justify-between border-b border-border px-4">
          <div><p className="text-sm font-extrabold">Conversation history</p><p className="text-[11px] text-muted">{sessions.length} saved · synced to this workspace</p></div>
          <button type="button" onClick={requestClose} aria-label="Close history" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-field text-muted transition-console hover:bg-subtle hover:text-ink"><X size={16} /></button>
        </div>
        <div className="p-3">
          <button type="button" onClick={onNew} disabled={Boolean(blocked)} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field bg-ink-strong px-3 py-2.5 text-xs font-bold text-white transition-console hover:bg-ink disabled:cursor-not-allowed disabled:opacity-45"><Plus size={14} /> New conversation</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessions.length ? sessions.map((session) => {
            return (
              <div key={session.id} className={cx("group flex items-start gap-1 rounded-field p-1", selectedId === session.id && "bg-card")}>
                <button type="button" onClick={() => onSelect(session.id)} className="min-w-0 flex-1 cursor-pointer rounded-[8px] px-2.5 py-2 text-left transition-console hover:bg-card">
                  <span className="block truncate text-xs font-bold text-ink-2">{session.title}</span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-muted"><MessageSquareText size={11} /> {session.messages.length} messages · {formatHistoryTime(session.updatedAt)}</span>
                </button>
                <button type="button" onClick={() => { void onDelete(session.id); }} disabled={Boolean(blocked) || clearing} aria-label={`Delete conversation: ${session.title}`} title="Delete conversation" className="mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-muted transition-console hover:bg-accent-wash hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} /></button>
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
                  <button type="button" onClick={() => { void onClearAll(); }} disabled={Boolean(blocked) || clearing} className="cursor-pointer rounded-field bg-accent px-3 py-2 text-xs font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{clearing ? "Clearing…" : "Yes, clear all"}</button>
                  <button type="button" onClick={() => setConfirmClear(false)} disabled={clearing} className="cursor-pointer rounded-field px-3 py-2 text-xs font-bold text-ink-2 hover:bg-card disabled:cursor-not-allowed">Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} disabled={Boolean(blocked) || clearing} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field px-3 py-2 text-xs font-bold text-muted transition-console hover:bg-accent-wash hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} /> Clear all conversations</button>
            )}
            {clearError ? <p role="alert" className="mt-2 text-xs text-accent-ink">{clearError}</p> : null}
          </div>
        ) : null}
      </aside>
    </div>, document.body
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
