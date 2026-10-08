"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Database, Eye, EyeOff, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { z } from "zod";
import { apiRequest } from "@/lib/http";
import { Card, CardHeader, Pill } from "@/components/ui/primitives";

const ViewSchema = z.object({ workspace_key: z.boolean(), server_key: z.boolean(), connected: z.boolean(),
  updated_at: z.string().nullable(), can_edit: z.boolean(), key_storage_ready: z.boolean(), live: z.boolean() });
type View = z.infer<typeof ViewSchema>;
const FIELD = "min-h-11 w-full rounded-field border border-border bg-card px-3 pr-12 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60";

/** Connect the workspace's own Sectors API key. Saving never calls Sectors. */
export function SectorsSettings() {
  const [view, setView] = useState<View | null>(null);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/api/v1/settings/sectors", { signal: controller.signal })
      .then((raw) => { if (!controller.signal.aborted) { setView(ViewSchema.parse(raw)); setError(""); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The data connection could not be loaded."); });
    return () => controller.abort();
  }, [attempt]);

  const act = async (request: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const next = ViewSchema.parse(await request());
      if (mounted.current) { setView(next); setKey(""); setShow(false); setMessage(done); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "The data connection could not be updated."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!key.trim()) return;
    void act(() => apiRequest("/api/v1/settings/sectors", { method: "PUT", body: JSON.stringify({ api_key: key.trim() }) }),
      "Sectors key saved. New investigations will use it. No request was sent to Sectors.");
  };
  const remove = () => {
    if (!window.confirm("Remove your saved Sectors key? New investigations will use the server key if one exists, otherwise research is paused until you add a key.")) return;
    void act(() => apiRequest("/api/v1/settings/sectors/key", { method: "DELETE" }), "Sectors key removed.");
  };
  const editable = Boolean(view?.can_edit) && !busy;
  const status = !view ? null : view.workspace_key ? { tone: "accent" as const, text: "Connected · your key" }
    : view.server_key ? { tone: "quiet" as const, text: "Connected · shared server key" } : { tone: "neutral" as const, text: "Not connected" };

  return <Card>
    <CardHeader title="Sectors data connection" aside={status ? <Pill tone={status.tone}>{status.text}</Pill> : <Database aria-hidden size={18} className="text-muted" />} />
    <p className="max-w-[80ch] text-sm leading-relaxed text-muted">RivalPulse reads company reports, financials and news from Sectors. Connect your own Sectors API key so research runs on your account and allowance.</p>
    {!view ? (error ? <div className="mt-4"><p role="alert" className="text-sm text-ink-2">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-field border border-border px-4 text-sm font-semibold"><RefreshCw aria-hidden size={15} />Retry</button></div>
      : <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted"><LoaderCircle aria-hidden size={16} className="animate-spin" />Checking data connection…</p>) : <>
      {!view.connected && view.live ? <p role="alert" className="mt-4 rounded-field border border-accent-wash-border bg-accent-wash p-3 text-sm text-ink-2">Research is paused until a Sectors API key is connected. Chat, your watchlist and saved findings still work.</p> : null}
      {!view.can_edit ? <p className="mt-4 rounded-field bg-subtle p-3 text-sm text-muted">Only workspace owners can change the data connection.</p> : null}
      <form onSubmit={save} className="mt-5 max-w-xl">
        <label htmlFor="sectors-key" className="mb-2 block text-xs font-bold text-ink-2">{view.workspace_key ? "Replace your Sectors API key" : "Sectors API key"}</label>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-64">
            <input id="sectors-key" type={show ? "text" : "password"} value={key} onChange={(event) => { setKey(event.target.value); setMessage(""); }}
              disabled={!editable || !view.key_storage_ready} minLength={10} maxLength={4096} autoComplete="new-password" spellCheck={false}
              placeholder={view.workspace_key ? "Paste a new key to replace the saved one" : "Paste your Sectors API key"} className={FIELD} />
            <button type="button" aria-label={show ? "Hide API key" : "Show API key"} disabled={!editable || !key} onClick={() => setShow((value) => !value)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-field text-muted disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent">{show ? <EyeOff aria-hidden size={17} /> : <Eye aria-hidden size={17} />}</button>
          </div>
          <button type="submit" disabled={!editable || !key.trim() || !view.key_storage_ready} className="inline-flex min-h-11 items-center gap-2 rounded-field bg-accent px-4 text-sm font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <LoaderCircle aria-hidden size={16} className="animate-spin" /> : null}{view.workspace_key ? "Replace key" : "Connect"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">Find your key in your Sectors account at sectors.app under API access. It is encrypted on the server, never shown again, and saving does not contact Sectors.</p>
        {view.workspace_key ? <button type="button" onClick={remove} disabled={!editable} className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-muted underline underline-offset-4 disabled:opacity-50"><Trash2 aria-hidden size={14} />Remove saved key</button> : null}
        {!view.key_storage_ready ? <p role="alert" className="mt-2 rounded-field border border-border bg-subtle p-3 text-sm">Secure key storage isn’t set up on this server yet. An administrator needs to configure the encryption key first.</p> : null}
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-ink-2">{error}</p> : null}
      {message ? <p role="status" className="mt-3 flex items-start gap-2 text-sm text-accent-ink"><Check aria-hidden size={16} className="mt-0.5 shrink-0" />{message}</p> : null}
    </>}
  </Card>;
}
