"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { LoaderCircle, Send, Sparkles } from "lucide-react";
import styles from "./AgentPrompt.module.css";

export interface PromptSuggestion { title: string; query: string }
interface AgentPromptProps {
  welcome?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (query: string) => void;
  disabled: boolean;
  working: boolean;
  suggestions: PromptSuggestion[];
  notices?: ReactNode;
}

export function AgentPrompt({ welcome = false, draft, onDraftChange, onSend, disabled, working, suggestions, notices }: AgentPromptProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const hintId = useId();
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!disabled) {
      submitting.current = false;
      // A completed run must not pull keyboard focus out of a menu or history drawer.
      const active = document.activeElement;
      if (!active || active === document.body || active === inputRef.current) inputRef.current?.focus({ preventScroll: true });
    }
  }, [disabled]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resize = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 152)}px`; };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => { if (width !== input.clientWidth) { width = input.clientWidth; resize(); } });
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft]);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (disabled || submitting.current || !draft.trim()) return;
    submitting.current = true;
    onSend(draft);
    queueMicrotask(() => { submitting.current = false; });
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
  };
  return <div className={`${styles.promptArea} ${welcome ? styles.welcome : ""}`}>
    <div className={styles.column}>
      {notices}
      {suggestions.length ? <section className={styles.recommendations} aria-label="Suggested questions based on your workspace">
        <p className={styles.label}><Sparkles size={13} aria-hidden /> Suggested for you</p>
        <div className={styles.cards}>{suggestions.map(({ title, query }) => <button key={query} type="button" className={styles.card} disabled={disabled} title={query} onClick={() => {
          onDraftChange(query); setAnnouncement(`${title} added to your draft. Edit it or press Enter to send.`); inputRef.current?.focus({ preventScroll: true });
        }}>{title}</button>)}</div>
      </section> : null}
      <form onSubmit={submit} className={styles.composer} aria-busy={working}>
        <textarea ref={inputRef} value={draft} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={keyDown} disabled={disabled} rows={1}
          placeholder={working ? "RivalPulse is investigating…" : "Ask a question or give a command…"} aria-label="Ask RivalPulse" aria-describedby={hintId} className={styles.input} />
        <button type="submit" className={styles.send} disabled={disabled || !draft.trim()} aria-label={working ? "Research in progress" : "Send message"}>
          {working ? <LoaderCircle aria-hidden size={17} className="animate-spin" /> : <Send aria-hidden size={17} />}<span>{working ? "Working" : "Send"}</span>
        </button>
      </form>
      <p id={hintId} className={styles.hints}>Enter to send <span aria-hidden>·</span> Shift + Enter for a new line</p>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  </div>;
}
