"use client";

import { useEffect, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import {
  type DemoSettings,
  demoSettingsServerSnapshot,
  demoSettingsSnapshot,
  subscribeToDemoSettings,
  writeDemoSettings,
} from "@/lib/demo-settings";

/**
 * Demo control panel — `?debug=1` or Ctrl+Shift+D.
 *
 * The app's empty, error and failure states are all correct and all invisible
 * during a healthy demo. This makes them reachable on demand, so they can be
 * rehearsed and filmed rather than described.
 *
 * It is hidden unless explicitly opened, and every control writes through
 * `demo-settings`, so nothing here can leak into a normal session.
 */
export function DebugPanel() {
  const raw = useSyncExternalStore(
    subscribeToDemoSettings,
    demoSettingsSnapshot,
    demoSettingsServerSnapshot,
  );
  const settings = JSON.parse(raw) as DemoSettings;

  const { reload, resetDemoState, signals, newSinceLastCheck, lastCheckedAt } =
    useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        writeDemoSettings({ debug: !settings.debug });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.debug]);

  if (!settings.debug) return null;

  /** Dashboard-affecting knobs need a refetch to take effect. */
  const set = (patch: Partial<DemoSettings>, refetch = true) => {
    writeDemoSettings(patch);
    if (refetch) reload();
  };

  return (
    <aside
      aria-label="Demo controls"
      className="fixed bottom-4 left-4 z-50 w-[280px] rounded-detail border border-border bg-card p-4 shadow-frame"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          Demo controls
        </p>
        <button
          type="button"
          aria-label="Close demo controls"
          onClick={() => writeDemoSettings({ debug: false })}
          className="-m-1 cursor-pointer p-1 text-muted transition-console hover:text-ink"
        >
          <X aria-hidden size={16} strokeWidth={1.5} />
        </button>
      </div>

      <dl className="mt-3 flex flex-col gap-1 border-b border-divider pb-3 text-[13px]">
        <Stat label="Signals" value={String(signals.length)} />
        <Stat label="Unseen" value={String(newSinceLastCheck)} />
        <Stat
          label="Last run"
          value={
            lastCheckedAt
              ? new Date(lastCheckedAt).toLocaleTimeString()
              : "never"
          }
        />
      </dl>

      <div className="mt-3 flex flex-col gap-2">
        <Toggle
          label="Sectors outage"
          hint="Inline error card"
          on={settings.failDashboard}
          onChange={(on) => set({ failDashboard: on })}
        />
        <Toggle
          label="Empty feed"
          hint="Quiet is a success state"
          on={settings.empty}
          onChange={(on) => set({ empty: on })}
        />
        <Toggle
          label="Fail agent runs"
          hint="Dies mid-step, offers retry"
          on={settings.failRun}
          onChange={(on) => set({ failRun: on }, false)}
        />
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[13px] text-muted">Latency</p>
        <div className="flex gap-1.5">
          {[0, 450, 2000].map((ms) => (
            <button
              key={ms}
              type="button"
              aria-pressed={settings.latencyMs === ms}
              onClick={() => set({ latencyMs: ms })}
              className={cx(
                "flex-1 cursor-pointer rounded-[9px] px-2 py-1.5 text-[13px] transition-console",
                settings.latencyMs === ms
                  ? "bg-ink-strong font-semibold text-surface"
                  : "border border-border bg-subtle text-ink-2 hover:bg-[#EBE8E2]",
              )}
            >
              {ms === 0 ? "None" : `${ms}ms`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-divider pt-3">
        <Button
          size="sm"
          className="w-full"
          onClick={() => {
            resetDemoState();
          }}
        >
          Reset demo state
        </Button>
        <p className="mt-1.5 text-[13px] text-muted">
          Clears seen flags and discovered signals — back to a first visit.
        </p>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        "flex cursor-pointer items-center justify-between gap-3 rounded-[9px] border px-2.5 py-2 text-left transition-console",
        on
          ? "border-accent-wash-border bg-accent-wash"
          : "border-border bg-subtle hover:bg-[#EBE8E2]",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink-2">
          {label}
        </span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span
        aria-hidden
        className={cx(
          "h-4 w-7 shrink-0 rounded-full p-0.5 transition-console",
          on ? "bg-accent" : "bg-neutral-200",
        )}
      >
        <span
          className={cx(
            "block h-3 w-3 rounded-full bg-white transition-chart",
            on && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}
