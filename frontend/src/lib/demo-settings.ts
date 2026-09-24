/**
 * Demo knobs.
 *
 * These let you rehearse the unhappy paths that judging rewards but that a
 * healthy mock dataset never produces: slow networks, a Sectors outage, a run
 * that dies mid-step, an empty feed.
 *
 * A URL parameter seeds a setting; from then on browser storage governs, so
 * the debug panel can always turn something back off. Writing a setting strips
 * the demo parameters from the URL to keep that rule true.
 *
 *   ?debug=1           show the debug panel (also Ctrl+Shift+D)
 *   ?latency=1200      artificial delay on every api call, in ms
 *   ?fail=dashboard    make getDashboard reject
 *   ?fail=run          make the next agent run fail mid-step
 *   ?empty=1           serve an empty signal feed
 *   ?seed=1            reset persisted state on load
 *
 * Every knob is inert unless explicitly set, so the default demo path is
 * unaffected.
 */

export interface DemoSettings {
  latencyMs: number;
  failDashboard: boolean;
  failRun: boolean;
  empty: boolean;
  debug: boolean;
  /** One-shot: never persisted. */
  seed: boolean;
}

export const DEMO_DEFAULTS: DemoSettings = {
  latencyMs: 450,
  failDashboard: false,
  failRun: false,
  empty: false,
  debug: false,
  seed: false,
};

const STORAGE_KEY = "rivalpulse.demo";
const CHANGE_EVENT = "rivalpulse:demo-settings";
const URL_PARAMS = ["debug", "latency", "fail", "empty", "seed"];

/** Safe on the server, where there is no URL and no storage. */
export function readDemoSettings(): DemoSettings {
  if (typeof window === "undefined") return DEMO_DEFAULTS;

  let stored: Partial<DemoSettings> = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as Partial<DemoSettings>;
  } catch {
    // Private mode, blocked storage — fall through to defaults.
  }

  const params = new URLSearchParams(window.location.search);
  const latencyParam = params.get("latency");
  const latency = Number(latencyParam);
  const fail = params.get("fail");

  return {
    latencyMs:
      latencyParam !== null && Number.isFinite(latency)
        ? latency
        : (stored.latencyMs ?? DEMO_DEFAULTS.latencyMs),
    failDashboard: fail === "dashboard" || Boolean(stored.failDashboard),
    failRun: fail === "run" || Boolean(stored.failRun),
    empty: params.get("empty") === "1" || Boolean(stored.empty),
    debug: params.get("debug") === "1" || Boolean(stored.debug),
    seed: params.get("seed") === "1",
  };
}

/**
 * Persist a change and tell subscribers. Demo parameters are stripped from the
 * URL so a stale `?fail=run` cannot override what the panel just set.
 */
export function writeDemoSettings(next: Partial<DemoSettings>): void {
  if (typeof window === "undefined") return;
  try {
    const merged = { ...readDemoSettings(), ...next, seed: false };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

    const url = new URL(window.location.href);
    let touched = false;
    for (const param of URL_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        touched = true;
      }
    }
    if (touched) window.history.replaceState(null, "", url.toString());

    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Non-fatal: the knobs are a convenience, never a requirement.
  }
}

export function subscribeToDemoSettings(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

/**
 * A referentially stable snapshot, for `useSyncExternalStore`. Reading browser
 * state this way avoids both a hydration mismatch and a setState-in-effect.
 */
export function demoSettingsSnapshot(): string {
  return JSON.stringify(readDemoSettings());
}

export function demoSettingsServerSnapshot(): string {
  return JSON.stringify(DEMO_DEFAULTS);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
