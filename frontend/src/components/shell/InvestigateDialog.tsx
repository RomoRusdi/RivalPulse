"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui/primitives";
import { useStore } from "@/lib/store";
import { useFocusTrap } from "@/lib/use-focus-trap";

/** Must match `.rp-modal-out` in globals.css. */
const EXIT_MS = 160;

const SUGGESTIONS = [
  "What changed for ISAT in enterprise this week?",
  "Compare pricing moves across TLKM, ISAT and EXCL",
  "Which competitor is growing faster than the industry?",
];

/**
 * The research-query prompt behind "+ Investigate".
 *
 * Mounted only while open, so the draft query resets by unmounting rather than
 * by clearing state in an effect. Starting a run is async — the dialog closes
 * immediately and the Agent run card takes over, leaving the user free to
 * navigate away.
 */
export function InvestigateDialog({ onClose }: { onClose: () => void }) {
  const { startRun, watchlist } = useStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Let the exit transition play before unmounting.
  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Traps Tab, handles Escape, and restores focus to the Investigate button.
  useFocusTrap(dialogRef, requestClose);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    startRun(trimmed);
    requestClose();
    router.push("/");
  };

  return (
    <div
      className={cx(
        "rp-fade fixed inset-0 z-50 flex items-start justify-center bg-ink/35 px-4 py-[12vh]",
        closing && "rp-fade-out",
      )}
      onClick={requestClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="investigate-title"
        tabIndex={-1}
        className={cx(
          "rp-modal w-full max-w-[560px] rounded-card border border-border bg-card p-5 shadow-frame",
          closing && "rp-modal-out",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="investigate-title" className="text-[17px] font-bold">
          Investigate competitors
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          The agent plans its own evidence, then pulls Sectors financial context
          for{" "}
          {(watchlist?.companies ?? []).map((c) => c.ticker).join(", ") ||
            "your watchlist"}
          .
        </p>

        <textarea
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(query);
            }
          }}
          placeholder="Ask a competitive question…"
          className="mt-4 w-full resize-none rounded-field border border-border bg-subtle px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-strong"
        />

        <div className="mt-3 flex flex-col gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="cursor-pointer rounded-[9px] px-2.5 py-2 text-left text-[13px] text-ink-2 transition-console hover:bg-subtle"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-divider pt-4">
          <p className="text-[13px] text-muted">
            Runs in the background · about 1 min
          </p>
          <div className="flex gap-2.5">
            <Button onClick={requestClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!query.trim()}
              onClick={() => submit(query)}
            >
              Start run
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
