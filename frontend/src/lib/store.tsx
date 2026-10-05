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
  USE_MOCKS,
  cancelRun as apiCancelRun,
  getActiveRun,
  getDashboard,
  startRun as apiStartRun,
  streamRun,
  updateWatchlist as apiUpdateWatchlist,
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
import { runFailureMessage } from "./format";
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
  mode: "live" | "replay" | null;
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
  /**
   * Batch forms. Several single calls in one tick would each read the same
   * pre-edit watchlist, so only the last one would survive.
   */
  addCompanies: (companies: Company[]) => void;
  removeCompanies: (tickers: string[]) => void;
  renameWatchlist: (name: string) => void;
  /** True when the watchlist differs from what the server sent. */
  watchlistEdited: boolean;
  /** Optional "our company" ticker. Null = neutral competitor comparison. */
  ourCompany: string | null;
  setOurCompany: (ticker: string | null) => void;

  /** The signed-in person. Edits are validated before they are kept. */
  profile: UserProfile;
  /** Returns an error message when the patch is rejected, otherwise null. */
  updateProfile: (patch: Partial<UserProfile>) => string | null;
  profileEdited: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

const PRIVATE_DEMO_PROFILE: UserProfile = {
  ...USER,
  id: "private-demo",
  name: "Demo researcher",
  role: "Workspace member",
  email: "demo@rivalpulse.test",
  workspace: "Private demo",
};

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { push } = useToast();

  const [mode, setMode] = useState<"live" | "replay" | null>(null);
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

  // Latest watchlist save. A run submitted while a PATCH is still in flight
  // would investigate the pre-edit membership while the UI already shows the
  // new one — startRun waits for this to settle first.
  const watchlistSave = useRef<Promise<unknown>>(Promise.resolve());

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
        setMode(data.mode);
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
  // Subscribing to a run is separated from submitting one so a 409 (another
  // investigation already active server-side) can resume watching the known
  // run instead of failing the chat message.
  const watchRun = useCallback(
    (run: AgentRun, nextReveal: string | null) => {
      setActiveRun(run);
      unsubscribe.current = streamRun(run, nextReveal, {
        onUpdate: (update) => {
          setActiveRun(update);

          if (update.status === "complete") {
            const produced = update.producedSignalIds ?? [];
            const checkedAt = new Date().toISOString();
            setLastCheckedAt(checkedAt);

            // Findings (including first-run baselines) live server-side;
            // refresh so Signals and the comparison graph show this run.
            reload();

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
                  : update.coverageStatus === "partial"
                    ? `Run #${update.id} finished — limited source coverage`
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
              body: runFailureMessage(update.failedTool),
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
    },
    [push, reload],
  );

  const startRun = useCallback(
    (query: string) => {
      unsubscribe.current?.();

      // The next unrevealed reserve signal is what this run will discover.
      const nextReveal =
        RESERVE_SIGNALS.find((s) => !revealedIds.includes(s.id))?.id ?? null;

      // Wait for any in-flight watchlist save: the backend investigates its
      // own membership snapshot, so submitting mid-PATCH would silently
      // investigate the wrong companies.
      const begin = () => {
        apiStartRun(query)
          .then((run) => {
            watchRun(run, nextReveal);
          })
          .catch((err: unknown) => {
            const conflict = err instanceof ApiError && /failed: 409/.test(err.message);
            const live = activeRun;
            if (conflict && live && (live.status === "queued" || live.status === "running")) {
              // The backend already has this investigation going and we know
              // it: resume watching instead of failing the chat message.
              watchRun(live, null);
              push({
                tone: "accent",
                title: "An investigation is already running",
                body: "Reconnected to it — watch progress here instead of starting over.",
              });
              return;
            }
            push({
              tone: "accent",
              title: "Could not start the run",
              body: conflict
                ? "An investigation is already running for this watchlist. Wait for it to finish (or stop it) before starting another."
                : err instanceof ApiError ? err.message : undefined,
            });
          });
      };
      void watchlistSave.current.then(begin, begin);
    },
    [activeRun, push, revealedIds, watchRun],
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

  // Resume a run orphaned by a page reload: the backend run keeps going, but
  // this page lifetime never subscribed to it. One shot per mount — the
  // chat attaches it to its research message like any live update.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || activeRun) return;
    resumedRef.current = true;
    void getActiveRun().then((run) => {
      if (run) watchRun(run, null);
    });
  }, [activeRun, watchRun]);

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
      const base = editedWatchlist ?? watchlist;
      if (!base) return;
      const parsed = WatchlistSchema.safeParse(mutate(base));
      if (!parsed.success) return;
      const previous = editedWatchlist;
      setEditedWatchlist(parsed.data);
      // Chain onto any in-flight save so the last edit wins in order, and so
      // startRun can wait for membership to settle server-side. Handled on
      // both paths, so this promise never rejects.
      watchlistSave.current = watchlistSave.current.then(
        () => apiUpdateWatchlist(parsed.data),
      ).then(
        (saved) => {
          setEditedWatchlist(saved);
        },
        (err: unknown) => {
          setEditedWatchlist(previous);
          push({
            tone: "accent",
            title: "Watchlist update was not saved",
            body: err instanceof ApiError ? err.message : "The server rejected the workspace command.",
          });
        },
      );
    },
    [editedWatchlist, push, watchlist],
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
        // Dropping our own company clears the perspective with it; a stale
        // ticker would otherwise keep framing every comparison.
        user_company: current.user_company === ticker ? null : current.user_company,
        companies: current.companies.filter((c) => c.ticker !== ticker),
      }));
    },
    [editWatchlist],
  );

  const addCompanies = useCallback(
    (companies: Company[]) => {
      editWatchlist((current) => {
        const tracked = new Set(current.companies.map((c) => c.ticker));
        const fresh = companies.filter((c) => !tracked.has(c.ticker));
        const room = Math.max(0, MAX_COMPANIES - current.companies.length);
        return fresh.length && room
          ? { ...current, companies: [...current.companies, ...fresh.slice(0, room)] }
          : current;
      });
    },
    [editWatchlist],
  );

  const removeCompanies = useCallback(
    (tickers: string[]) => {
      const drop = new Set(tickers);
      editWatchlist((current) => ({
        ...current,
        user_company: current.user_company && drop.has(current.user_company) ? null : current.user_company,
        companies: current.companies.filter((c) => !drop.has(c.ticker)),
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

  const ourCompany = activeWatchlist?.user_company ?? null;

  const setOurCompany = useCallback(
    (ticker: string | null) => {
      editWatchlist((current) => ({ ...current, user_company: ticker }));
    },
    [editWatchlist],
  );

  // ── Profile ─────────────────────────────────────────────────────────────
  // Same rule as the watchlist: validate before keeping, so a bad edit (or a
  // tampered localStorage entry) can never reach the rest of the app.
  const profile = editedProfile ?? (USE_MOCKS ? USER : PRIVATE_DEMO_PROFILE);

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
      mode,
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
      addCompanies,
      removeCompanies,
      renameWatchlist,
      watchlistEdited: editedWatchlist !== null,
      ourCompany,
      setOurCompany,
      profile,
      updateProfile,
      profileEdited: editedProfile !== null,
    }),
    [
      mode,
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
      addCompanies,
      removeCompanies,
      renameWatchlist,
      ourCompany,
      setOurCompany,
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
