"use client";
import Link from "next/link";
import { History, Plus } from "lucide-react";
import { useAgentNavigation } from "./AgentNavigation";
import { useStore } from "@/lib/store";
import styles from "./AgentControls.module.css";

/** Keep nodes mounted so the child actions reverse smoothly as routes change. */
export function AgentControls({ collapsed = false, active = true, onAction }: { collapsed?: boolean; active?: boolean; onAction?: () => void }) {
  const actions = useAgentNavigation();
  const { activeRun } = useStore();
  const blocked = actions?.blocked || activeRun?.status === "queued" || activeRun?.status === "running";
  return <div className={styles.root} data-collapsed={collapsed} data-open={active} inert={!active} aria-hidden={!active} role="group" aria-label="Agent conversations"><div className={styles.clip}><div className={styles.options}>
    {([{ kind: "new", label: "New chat", Icon: Plus }, { kind: "history", label: "History", Icon: History }] as const).map(({ kind, label, Icon }) => {
      const disabled = kind === "new" && blocked;
      return <Link key={kind} href={{ pathname: "/", query: { chat: kind } }} aria-label={label} title={collapsed ? label : undefined}
        aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} className={styles.option}
        onClick={(event) => {
          if (disabled) { event.preventDefault(); return; }
          if (actions) { event.preventDefault(); onAction?.(); if (kind === "new") actions.onNew(); else actions.onHistory(); }
          else onAction?.();
        }}>
        <span className={styles.icon}><Icon size={16} aria-hidden /></span><span aria-hidden className={`rp-sidebar-label ${styles.copy}`}>{label}</span>
      </Link>;
    })}
  </div></div></div>;
}
