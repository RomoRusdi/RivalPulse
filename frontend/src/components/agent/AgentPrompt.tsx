"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUp, ListPlus, LoaderCircle, Rocket, Sparkles, Tag } from "lucide-react";
import { reducedMotion } from "@/lib/motion";
import styles from "./AgentPrompt.module.css";

export interface PromptSuggestion { title: string; query: string; category?: "pricing" | "product" | "watchlist" }
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
const HEADING = "What would you like to know today?";
const WORDS = HEADING.split(" ");

export function AgentPrompt({ welcome = false, draft, onDraftChange, onSend, disabled, working, suggestions, notices }: AgentPromptProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const well = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const typingFrame = useRef(0);
  const typingTarget = useRef<string | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();
  const [announcement, setAnnouncement] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [sentValue, setSentValue] = useState<string | null>(null);
  const placeholder = working ? "RivalPulse is investigating…" : "Ask a question or give a command…";
  // In a conversation, suggestions appear only while the box is in use
  // (focused or holding text), so they never cover the chat by default.
  const [engaged, setEngaged] = useState(false);
  const recommendationsVisible = welcome || engaged || Boolean(draft.trim());

  useEffect(() => () => {
    cancelAnimationFrame(typingFrame.current);
    if (sendTimer.current) clearTimeout(sendTimer.current);
  }, []);
  useEffect(() => {
    if (!disabled) {
      submitting.current = false;
      const active = document.activeElement;
      if (!active || active === document.body || active === inputRef.current) inputRef.current?.focus({ preventScroll: true });
    }
  }, [disabled]);
  useLayoutEffect(() => {
    if (typingTarget.current) inputRef.current?.setSelectionRange(draft.length, draft.length);
  }, [draft]);
  useLayoutEffect(() => {
    if (!mirror.current || !well.current) return;
    const resize = (height: number) => well.current?.style.setProperty("--composer-growth", `${Math.max(0, Math.min(1, (height - 44) / 112))}fr`);
    resize(mirror.current.getBoundingClientRect().height);
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.borderBoxSize[0]?.blockSize ?? mirror.current!.getBoundingClientRect().height;
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => resize(height));
    });
    observer.observe(mirror.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  const cancelFill = () => {
    cancelAnimationFrame(typingFrame.current);
    typingTarget.current = null;
    setFilling(false);
  };
  const fillSuggestion = ({ title, query }: PromptSuggestion) => {
    cancelFill();
    setSelected(query);
    setAnnouncement(`${title} added to your draft. Edit it or press Enter to send.`);
    inputRef.current?.focus({ preventScroll: true });
    if (reducedMotion()) { onDraftChange(query); return; }
    typingTarget.current = query;
    setFilling(true);
    onDraftChange("");
    const letters = Array.from(query);
    let started: number | null = null;
    const duration = Math.min(750, letters.length * 14);
    const type = (now: number) => {
      started ??= now;
      const progress = reducedMotion() ? 1 : Math.min(1, (now - started) / duration);
      onDraftChange(letters.slice(0, Math.ceil(progress * letters.length)).join(""));
      if (progress < 1) typingFrame.current = requestAnimationFrame(type);
      else typingFrame.current = requestAnimationFrame(() => { typingTarget.current = null; setFilling(false); });
    };
    typingFrame.current = requestAnimationFrame(type);
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    // Enter during the fill animation sends the complete recommendation.
    const query = typingTarget.current ?? draft;
    if (disabled || submitting.current || !query.trim()) return;
    submitting.current = true;
    cancelFill();
    setSelected(null);
    setSentValue(query);
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => setSentValue(null), reducedMotion() ? 160 : 650);
    onSend(query);
    queueMicrotask(() => { submitting.current = false; });
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
    else if (typingTarget.current && (event.ctrlKey || event.metaKey || ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(event.key))) cancelFill();
  };

  return <div className={`${styles.promptArea} ${welcome ? styles.welcome : styles.compact}`}>
    <div className={styles.column} onFocus={() => setEngaged(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEngaged(false); }}>
      {welcome ? <div className={styles.hero}>
        <h1 className={styles.heading} aria-label={HEADING}>{WORDS.map((word, index) => <span aria-hidden key={`${word}-${index}`} style={{ "--word-index": index } as CSSProperties}>{word}{index < WORDS.length - 1 ? " " : ""}</span>)}</h1>
        <p className={styles.subtitle}>Recommendations are based on your watchlist and recent competitor activity</p>
      </div> : null}
      {notices}
      {suggestions.length ? <section className={`${styles.recommendations} rp-expand`} data-open={recommendationsVisible} inert={!recommendationsVisible} aria-hidden={!recommendationsVisible} aria-label="Suggested questions based on your workspace"><div className={styles.recommendationContent}>
        <p className={styles.label}><Sparkles size={14} aria-hidden /> Suggested for you</p>
        <div className={styles.cards}>{suggestions.slice(0, 3).map((suggestion, index) => {
          const Icon = suggestion.category === "pricing" ? Tag : suggestion.category === "product" ? Rocket : suggestion.category === "watchlist" ? ListPlus : Sparkles;
          return <div key={suggestion.query} className={styles.cardEntrance} style={{ "--card-index": index } as CSSProperties}>
            <button type="button" className={styles.card} data-selected={selected === suggestion.query} disabled={disabled} title={suggestion.query} onMouseDown={(event) => { if (!welcome) event.preventDefault(); }} onClick={() => fillSuggestion(suggestion)}>
              <span className={styles.iconTile}><Icon size={19} strokeWidth={1.7} aria-hidden /></span>
              <span className={styles.cardCopy}><span className={styles.cardTitle}>{suggestion.title}</span><span className={styles.description}>{suggestion.query}</span></span>
            </button>
          </div>;
        })}</div>
      </div></section> : null}
      {/* One floating card: the input plus its hint row, like a toolbar footer. */}
      <div className={styles.shell}>
      <form onSubmit={submit} className={styles.composer} data-sending={Boolean(sentValue)} data-filling={filling} aria-busy={working}>
        <div ref={well} className={styles.inputWell}>
          <div className={styles.inputBase} aria-hidden />
          <div className={styles.inputGrowth} aria-hidden><div className={styles.growthClip}><div className={styles.growthSpace} /></div></div>
          <div ref={mirror} className={styles.inputMirror} aria-hidden>{`${draft || placeholder}\u200b`}</div>
          <textarea ref={inputRef} value={draft} onChange={(event) => { cancelFill(); setSelected(null); onDraftChange(event.target.value); }} onKeyDown={keyDown} onPointerDown={cancelFill} disabled={disabled} rows={1}
            placeholder={placeholder} aria-label="Ask RivalPulse" aria-describedby={hintId} className={styles.input} />
          {sentValue ? <span aria-hidden className={styles.outgoingQuery}>{sentValue}</span> : null}
        </div>
        <button type="submit" className={styles.send} data-active={!disabled && Boolean(draft.trim())} disabled={disabled || !draft.trim()} aria-label={working ? "Research in progress" : "Send message"}>
          {working ? <LoaderCircle aria-hidden size={20} className="animate-spin" /> : <ArrowUp aria-hidden size={22} strokeWidth={2.2} className={styles.sendIcon} />}
        </button>
      </form>
      <div id={hintId} className={styles.hints}><p>Ask about your competitors or update your watchlist.</p><p className={styles.shortcuts}><kbd>Enter</kbd> to send <span aria-hidden>·</span> <kbd>Shift + Enter</kbd> for a new line</p></div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  </div>;
}
