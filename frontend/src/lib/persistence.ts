/**
 * ============================================================================
 * DEMO SHIM — DELETE WHEN THE BACKEND LANDS
 * ============================================================================
 *
 * Read state belongs on the server: which signals a user has seen, and when
 * they last checked, are per-user facts that should survive a new device, not
 * just a new tab.
 *
 * Until Postgres exists, this keeps that state in localStorage so the demo's
 * most important beat actually works — run the agent, reload the page, and
 * "2 new signals since your last check" is still true.
 *
 * To remove: delete this file, drop the `loadLocalState` / `saveLocalState`
 * calls in `store.tsx`, and let the API supply `seen` and `lastCheckedAt`.
 *
 * Everything here is wrapped in try/catch. Storage can throw in private
 * windows or when site data is blocked, and a demo must never die on that.
 * ============================================================================
 */

const STORAGE_KEY = "rivalpulse.state.v1";

export interface LocalState {
  /** Signal ids the user has opened. */
  seenIds: string[];
  /** Signal ids revealed by agent runs, beyond the seeded feed. */
  revealedIds: string[];
  /** ISO timestamp of the last completed run. */
  lastCheckedAt: string | null;
  /**
   * The user's edited watchlist, when they have changed it. Null means "use
   * whatever the server sent". Stored loosely and re-validated on read, since
   * anything in localStorage is untrusted input.
   */
  watchlist: unknown;
}

const EMPTY: LocalState = {
  seenIds: [],
  revealedIds: [],
  lastCheckedAt: null,
  watchlist: null,
};

export function loadLocalState(): LocalState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      seenIds: Array.isArray(parsed.seenIds) ? parsed.seenIds : [],
      revealedIds: Array.isArray(parsed.revealedIds) ? parsed.revealedIds : [],
      lastCheckedAt:
        typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
      watchlist: parsed.watchlist ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export function saveLocalState(state: LocalState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Non-fatal.
  }
}

export function clearLocalState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
