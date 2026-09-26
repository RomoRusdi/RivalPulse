"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  cancelRun as apiCancelRun,
  getDashboard,
  startRun as apiStartRun,
  streamRun,
} from "./api";
import {
  MIX_COLORS,
  MIX_ORDER,
  RESERVE_SIGNALS,
  RUN_STEPS,
  USER,
} from "./mock-data";
import {
  clearLocalState,
  loadLocalState,
  saveLocalState,
} from "./persistence";
import { readDemoSettings } from "./demo-settings";
import { useToast } from "@/components/ui/Toast";
import { MAX_COMPANIES } from "./catalogue";
import { UserProfileSchema, WatchlistSchema } from "./schemas";
import type {
  AgentRun,
  Company,
  DashboardAggregates,
  Range,
  SignalWithState,
  UserProfile,
  Watchlist,
} from "./types";

/**
 * Application state.
 *
 * All data arrives through `api.ts`, so this file does not know whether it is
 * talking to mocks or the real backend. Read state (`seen`, last checked) is
 * merged in from browser storage until the backend owns it.
 */

interface StoreValue {
  watchlist: Watchlist | null;
  signals: SignalWithState[];
  aggregates: DashboardAggregates | null;
  range: Range;
  setRange: (range: Range) => void;
  newSinceLastCheck: number;
  lastCheckedAt: string | null;
  /**
   * Signals a run surfaced during this session. Deliberately not persisted:
   * it drives the row's entrance animation, which should play when the signal
   * actually arrives and never on a page load.
   */
  justRevealedIds: string[];
  activeRun: AgentRun | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  startRun: (query: string) => void;
  cancelRun: () => void;
  retryRun: () => void;
  dismissRun: () => void;
  markSignalSeen: (id: string) => void;
  markAllSeen: () => void;
  /** Demo affordance: wipe persisted read state and revealed signals. */
  resetDemoState: () => void;

  /** Watchlist editing. Rejected silently when it would break the 2-5 rule. */
  addCompany: (company: Company) => void;
  removeCompany: (ticker: string) => void;
  renameWatchlist: (name: string) => void;
  /** True when the watchlist differs from what the server sent. */
  watchlistEdited: boolean;

  /** The signed-in person. Edits are validated before they are kept. */
  profile: UserProfile;
  /** Returns an error message when the patch is rejected, otherwise null. */
  updateProfile: (patch: Partial<UserProfile>) => string | null;
  profileEdited: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { push } = useToast();

  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [aggregates, setAggregates] = useState<DashboardAggregates | null>(
    null,
  );
  const [rawSignals, setRawSignals] = useState<SignalWithState[]>([]);
  const [range, setRange] = useState<Range>("week");
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Persisted read state. Hydrated in an effect so server and first client
  // render agree; until then the UI shows its loading state anyway.
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [editedWatchlist, setEditedWatchlist] = useState<Watchlist | null>(
    null,
  );
  const [editedProfile, setEditedProfile] = useState<UserProfile | null>(null);
  const [justRevealedIds, setJustRevealedIds] = useState<string[]>([]);
  const hydrated = useRef(false);

  const unsubscribe = useRef<(() => void) | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  // Persisted state is read inside the async body rather than during render:
  // localStorage does not exist on the server, so reading it in a `useState`
  // initializer would make the first client render disagree with the server's.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!hydrated.current) {
        hydrated.current = true;
        if (readDemoSettings().seed) clearLocalState();
      }
      const local = loadLocalState();

      try {
        const data = await getDashboard(range, local.revealedIds);
        if (cancelled) return;
        setSeenIds(local.seenIds);
        setRevealedIds(local.revealedIds);
        setLastCheckedAt(local.lastCheckedAt);
        setWatchlist(data.watchlist);

        // A stored watchlist is untrusted input — validate before trusting it,
        // and fall back to the server's copy if it no longer fits the schema.
        const stored = WatchlistSchema.safeParse(local.watchlist);
        setEditedWatchlist(stored.success ? stored.data : null);
        const storedProfile = UserProfileSchema.safeParse(local.profile);
        setEditedProfile(storedProfile.success ? storedProfile.data : null);
        setAggregates(data.aggregates);
        setRawSignals(
          data.signals.map((s) => ({
            ...s,
            seen: local.seenIds.includes(s.id),
          })),
        );
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong loading the dashboard.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [range, reloadToken]);

  /** Range changes and reloads own their own loading state. */
  const changeRange = useCallback((next: Range) => {
    setLoading(true);
    setError(null);
    setRange(next);
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadToken((n) => n + 1);
  }, []);

  // ── Persist ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated.current) return;
    saveLocalState({
      seenIds,
      revealedIds,
      lastCheckedAt,
      watchlist: editedWatchlist,
      profile: editedProfile,
    });
  }, [seenIds, revealedIds, lastCheckedAt, editedWatchlist, editedProfile]);

  useEffect(() => () => unsubscribe.current?.(), []);

  // ── Runs ────────────────────────────────────────────────────────────────
  const startRun = useCallback(
    (query: string) => {
      unsubscribe.current?.();

      // The next unrevealed reserve signal is what this run will discover.
      const nextReveal =
        RESERVE_SIGNALS.find((s) => !revealedIds.includes(s.id))?.id ?? null;

      apiStartRun(query)
        .then((run) => {
          setActiveRun(run);
          unsubscribe.current = streamRun(run, nextReveal, {
            onUpdate: (update) => {
              setActiveRun(update);

              if (update.status === "complete") {
                const produced = update.producedSignalIds ?? [];
                const checkedAt = new Date().toISOString();
                setLastCheckedAt(checkedAt);

                if (produced.length > 0) {
                  setRevealedIds((prev) => [...new Set([...prev, ...produced])]);
                  setJustRevealedIds((prev) => [
                    ...new Set([...prev, ...produced]),
                  ]);
                  const revealed = RESERVE_SIGNALS.filter((s) =>
                    produced.includes(s.id),
                  ).map((s) => ({ ...s, seen: false }));
                  setRawSignals((prev) => [...revealed, ...prev]);
                }

                push({
                  tone: "accent",
                  title:
                    produced.length > 0
                      ? `Run #${update.id} found ${produced.length} new signal${produced.length === 1 ? "" : "s"}`
                      : `Run #${update.id} finished — nothing above threshold`,
                  body: update.resultSummary,
                  action:
                    produced.length > 0
                      ? { label: "View signals", href: "/signals" }
                      : undefined,
                });
              }

              if (update.status === "failed") {
                push({
                  tone: "accent",
                  title: `Run #${update.id} failed`,
                  body: `Tool call ${update.failedTool} did not return. No stale data was substituted.`,
                });
              }
            },
            onError: (streamError) => {
              setActiveRun((run) =>
                run
                  ? { ...run, status: "failed", failedTool: "run stream" }
                  : run,
              );
              push({ tone: "accent", title: "Run stream lost", body: streamError.message });
            },
          });
        })
        .catch((err: unknown) => {
          push({
            tone: "accent",
            title: "Could not start the run",
            body: err instanceof ApiError ? err.message : undefined,
          });
        });
    },
    [push, revealedIds],
  );

  const cancelRun = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setActiveRun((run) => {
      if (run) void apiCancelRun(run.id);
      return null;
    });
  }, []);

  const retryRun = useCallback(() => {
    const query = activeRun?.query;
    if (query) startRun(query);
  }, [activeRun, startRun]);

  const dismissRun = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setActiveRun(null);
  }, []);

  // ── Read state ──────────────────────────────────────────────────────────
  // Both of these return the previous array untouched when nothing actually
  // changes. Allocating a fresh array unconditionally would give every signal
  // a new identity on each call, and any effect watching a signal object would
  // re-fire forever.
  const markSignalSeen = useCallback((id: string) => {
    setSeenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setRawSignals((prev) =>
      prev.some((s) => s.id === id && !s.seen)
        ? prev.map((s) => (s.id === id ? { ...s, seen: true } : s))
        : prev,
    );
  }, []);

  const markAllSeen = useCallback(() => {
    setRawSignals((prev) => {
      if (prev.every((s) => s.seen)) return prev;
      setSeenIds((ids) => [...new Set([...ids, ...prev.map((s) => s.id)])]);
      return prev.map((s) => (s.seen ? s : { ...s, seen: true }));
    });
  }, []);

  // ── Watchlist editing ───────────────────────────────────────────────────
  // Edits are local to this browser until the backend owns watchlists; the
  // active list is the edited one when present, otherwise the server's.
  const activeWatchlist = editedWatchlist ?? watchlist;

  const editWatchlist = useCallback(
    (mutate: (current: Watchlist) => Watchlist) => {
      setEditedWatchlist((current) => {
        const base = current ?? watchlist;
        if (!base) return current;
        const next = mutate(base);
        // Never persist a watchlist the schema would reject.
        const parsed = WatchlistSchema.safeParse(next);
        return parsed.success ? parsed.data : current;
      });
    },
    [watchlist],
  );

  const addCompany = useCallback(
    (company: Company) => {
      editWatchlist((current) =>
        current.companies.length >= MAX_COMPANIES ||
        current.companies.some((c) => c.ticker === company.ticker)
          ? current
          : { ...current, companies: [...current.companies, company] },
      );
    },
    [editWatchlist],
  );

  const removeCompany = useCallback(
    (ticker: string) => {
      editWatchlist((current) => ({
        ...current,
        companies: current.companies.filter((c) => c.ticker !== ticker),
      }));
    },
    [editWatchlist],
  );

  const renameWatchlist = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      editWatchlist((current) => ({ ...current, name: trimmed }));
    },
    [editWatchlist],
  );

  // ── Profile ─────────────────────────────────────────────────────────────
  // Same rule as the watchlist: validate before keeping, so a bad edit (or a
  // tampered localStorage entry) can never reach the rest of the app.
  const profile = editedProfile ?? USER;

  const updateProfile = useCallback(
    (patch: Partial<UserProfile>): string | null => {
      const next = { ...profile, ...patch };
      const parsed = UserProfileSchema.safeParse(next);
      if (!parsed.success) {
        return parsed.error.issues[0]?.message ?? "That change is not valid.";
      }
      setEditedProfile(parsed.data);
      return null;
    },
    [profile],
  );

  const resetDemoState = useCallback(() => {
    clearLocalState();
    setSeenIds([]);
    setRevealedIds([]);
    setLastCheckedAt(null);
    setEditedWatchlist(null);
    setEditedProfile(null);
    setActiveRun(null);
    setReloadToken((n) => n + 1);
  }, []);

  // Removing a competitor has to actually remove its signals, or editing the
  // watchlist would be cosmetic.
  const visibleSignals = useMemo(() => {
    if (!activeWatchlist) return rawSignals;
    const tickers = new Set(activeWatchlist.companies.map((c) => c.ticker));
    return rawSignals.filter((s) => tickers.has(s.company));
  }, [rawSignals, activeWatchlist]);

  /**
   * Reconcile the headline numbers against the feed the user can actually see.
   *
   * Three cards used to report signal counts from three independent mock
   * fields, so "7 this week", "24 signals" and "24 delivered" could all be on
   * screen at once and contradict each other. Everything downstream of
   * delivery is now derived from `visibleSignals`, which also keeps it honest
   * after a run adds a signal or a watchlist edit removes a company.
   */
  const reconciledAggregates = useMemo(() => {
    if (!aggregates) return null;

    const total = visibleSignals.length;
    const mix = MIX_ORDER.map((label) => {
      const count = visibleSignals.filter((s) => s.type === label).length;
      return {
        label,
        count,
        percent: total === 0 ? 0 : Math.round((count / total) * 100),
        color: MIX_COLORS[label],
      };
    });

    const candidates = aggregates.pipeline[0]?.count ?? 0;

    return {
      ...aggregates,
      signalsInRange: total,
      highSeverityCount: visibleSignals.filter((s) => s.severity === "high")
        .length,
      mix,
      mixTotal: total,
      pipeline: aggregates.pipeline.map((stage) =>
        stage.label === "Delivered"
          ? {
              ...stage,
              count: total,
              percent:
                candidates === 0
                  ? 0
                  : Math.max(1, Math.round((total / candidates) * 100)),
            }
          : stage,
      ),
    };
  }, [aggregates, visibleSignals]);

  const value = useMemo<StoreValue>(
    () => ({
      watchlist: activeWatchlist,
      signals: visibleSignals,
      aggregates: reconciledAggregates,
      range,
      setRange: changeRange,
      newSinceLastCheck: visibleSignals.filter((s) => !s.seen).length,
      lastCheckedAt,
      justRevealedIds,
      activeRun,
      loading,
      error,
      reload,
      startRun,
      cancelRun,
      retryRun,
      dismissRun,
      markSignalSeen,
      markAllSeen,
      resetDemoState,
      addCompany,
      removeCompany,
      renameWatchlist,
      watchlistEdited: editedWatchlist !== null,
      profile,
      updateProfile,
      profileEdited: editedProfile !== null,
    }),
    [
      activeWatchlist,
      visibleSignals,
      editedWatchlist,
      justRevealedIds,
      reconciledAggregates,
      range,
      changeRange,
      reload,
      lastCheckedAt,
      activeRun,
      loading,
      error,
      startRun,
      cancelRun,
      retryRun,
      dismissRun,
      markSignalSeen,
      markAllSeen,
      resetDemoState,
      addCompany,
      removeCompany,
      renameWatchlist,
      profile,
      updateProfile,
      editedProfile,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

/** Fallback steps for rendering the run card before a run exists. */
export { RUN_STEPS };
