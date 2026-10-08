"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, LoaderCircle, LockKeyhole, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { z } from "zod";
import { accountGeneration, apiRequest } from "@/lib/http";
import { Card, CardHeader, cx } from "@/components/ui/primitives";
import { Select } from "@/components/ui/Select";

const PROVIDERS = [{ id: "ollama", label: "Local Ollama", name: "Ollama", note: "Free · runs on this server" },
  { id: "openai", label: "OpenAI", name: "OpenAI", note: "Uses your OpenAI API key" },
  { id: "anthropic", label: "Anthropic (Claude)", name: "Anthropic", note: "Uses your Anthropic API key" },
  { id: "gemini", label: "Google Gemini", name: "Google", note: "Uses your Google AI Studio key" }] as const;
const ProviderSchema = z.enum(["ollama", "openai", "anthropic", "gemini"]);
type Provider = z.infer<typeof ProviderSchema>;
const SettingsSchema = z.object({ provider: ProviderSchema, model: z.string(), enabled: z.boolean(), cloud_consent: z.boolean(),
  can_edit: z.boolean(), key_storage_ready: z.boolean(), connection_tested: z.boolean(),
  providers: z.array(z.object({ provider: ProviderSchema, model: z.string(), key_configured: z.boolean(), updated_at: z.string().nullable() })) });
const ModelsSchema = z.object({ provider: ProviderSchema, key_source: z.string(),
  models: z.array(z.object({ id: z.string(), label: z.string(), suggested: z.boolean() })) });
type Settings = z.infer<typeof SettingsSchema>;
type Models = z.infer<typeof ModelsSchema>["models"];
const FIELD = "min-h-11 w-full rounded-field border border-border bg-card px-3 text-sm text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60";
// Last loaded settings, kept across page visits so the card renders at once
// and refreshes in the background. No secrets are stored here.
let settingsCacheEntry: { generation: number; data: Settings } | null = null;
const cachedSettings = () => settingsCacheEntry?.generation === accountGeneration() ? settingsCacheEntry.data : null;
const rememberSettings = (data: Settings) => { settingsCacheEntry = { generation: accountGeneration(), data }; };
const MODEL_ID = String.raw`[a-zA-Z0-9][a-zA-Z0-9._:\/\-]{0,99}`;

function Step({ number, title, done, children }: { number: number; title: string; done?: boolean; children: React.ReactNode }) {
  return <section className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
    <span aria-hidden className={cx("flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold", done ? "bg-accent text-surface" : "bg-subtle text-ink-2")}>{done ? <Check size={14} /> : number}</span>
    <div className="min-w-0"><h3 className="flex min-h-7 items-center text-sm font-bold text-ink">{title}</h3><div className="mt-2">{children}</div></div>
  </section>;
}

export function ModelSettings() {
  const [saved, setSaved] = useState<Settings | null>(cachedSettings);
  const [provider, setProvider] = useState<Provider>(cachedSettings()?.provider ?? "ollama");
  const [model, setModel] = useState(cachedSettings()?.model ?? "");
  const [enabled, setEnabled] = useState(cachedSettings()?.enabled ?? true);
  const [consent, setConsent] = useState(cachedSettings()?.cloud_consent ?? false);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<Models | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => !cachedSettings());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /** Connect step: lists models the key can use. Saves nothing and generates nothing. */
  const connect = useCallback(async (target: Provider, pasted: string, current: string) => {
    const ticket = ++request.current;
    setConnecting(true); setConnectError(""); setMessage("");
    try {
      const data = ModelsSchema.parse(await apiRequest("/api/v1/settings/llm/models", { method: "POST",
        body: JSON.stringify({ provider: target, ...(pasted ? { api_key: pasted } : {}) }) }));
      if (!mounted.current || ticket !== request.current) return;
      setModels(data.models);
      if (data.models.length && !data.models.some((item) => item.id === current)) {
        setModel((data.models.find((item) => item.suggested) ?? data.models[0]).id); setManual(false);
      }
      if (!data.models.length) setConnectError("Connected, but this account has no chat models available. Enter a model ID manually.");
    } catch (cause) {
      if (mounted.current && ticket === request.current) { setModels(null); setConnectError(cause instanceof Error ? cause.message : "Could not connect to this provider."); }
    } finally { if (mounted.current && ticket === request.current) setConnecting(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest("/api/v1/settings/llm", { signal: controller.signal }).then((raw) => {
      if (controller.signal.aborted) return;
      const data = SettingsSchema.parse(raw);
      rememberSettings(data); setSaved(data); setProvider(data.provider); setModel(data.model); setEnabled(data.enabled); setConsent(data.cloud_consent); setError(""); setLoading(false);
      // Local Ollama is free to ask, so its list loads on its own; cloud providers wait for Connect.
      if (data.provider === "ollama" && data.can_edit) void connect("ollama", "", data.model);
    }).catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Model settings could not be loaded."); setLoading(false); } });
    return () => controller.abort();
  }, [attempt, connect]);

  const cloud = provider !== "ollama";
  const meta = PROVIDERS.find((item) => item.id === provider)!;
  const hasKey = saved?.providers.find((item) => item.provider === provider)?.key_configured ?? false;
  const editable = Boolean(saved?.can_edit) && !busy;
  const connected = models !== null;
  const dirty = saved && (provider !== saved.provider || model !== saved.model || enabled !== saved.enabled || consent !== saved.cloud_consent || Boolean(key));
  const choose = (next: Provider) => {
    request.current++;
    setProvider(next); setModel(saved?.providers.find((item) => item.provider === next)?.model ?? "");
    setKey(""); setShowKey(false); setModels(null); setConnectError(""); setConnecting(false); setManual(false);
    setConsent(next === saved?.provider ? saved.cloud_consent : false); setMessage(""); setError("");
    if (next === "ollama") void connect("ollama", "", saved?.providers.find((item) => item.provider === "ollama")?.model ?? "");
  };
  const accept = (data: Settings) => {
    rememberSettings(data); setSaved(data); setProvider(data.provider); setModel(data.model); setEnabled(data.enabled); setConsent(data.cloud_consent); setKey(""); setShowKey(false);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editable) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = SettingsSchema.parse(await apiRequest("/api/v1/settings/llm", { method: "PATCH", body: JSON.stringify({ provider, model: model.trim(), enabled, cloud_consent: cloud && consent, ...(key ? { api_key: key } : {}) }) }));
      if (mounted.current) { accept(data); setMessage(data.enabled ? `Saved. New investigations and chat will use ${meta.name} · ${data.model}.` : "Saved. AI explanations and chat are turned off."); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Model settings could not be saved."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const remove = async () => {
    if (!editable || !hasKey || !cloud) return;
    if (!window.confirm(`Remove the saved ${meta.label} key? If this provider is active, AI will be turned off for new requests. Requests already running are not cancelled.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = SettingsSchema.parse(await apiRequest(`/api/v1/settings/llm/keys/${provider}`, { method: "DELETE" }));
      if (mounted.current) { accept(data); setModels(null); setMessage("Key removed. If it may have leaked, also revoke it in your provider account."); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "The key could not be removed."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const options = (models ?? []).map((item) => ({ value: item.id, label: item.label,
    description: item.suggested ? `${item.id} · Suggested: fast and low cost` : item.label !== item.id ? item.id : undefined }));
  const canConnect = editable && !connecting && (!cloud || Boolean(key) || hasKey) && (!cloud || saved?.key_storage_ready || !key);

  return <Card>
    <CardHeader title="AI model" aside={<LockKeyhole aria-hidden size={18} className="text-muted" />} />
    <p className="max-w-[80ch] text-sm leading-relaxed text-muted">Pick the AI that writes finding explanations and answers chat questions. RivalPulse still chooses the data sources, checks every claim against evidence, and does all financial calculations itself.</p>
    {loading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted"><LoaderCircle aria-hidden size={16} className="animate-spin" />Loading AI settings…</p> : !saved ? <div className="mt-5"><p role="alert" className="text-sm text-ink-2">{error}</p><button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-field border border-border px-4 text-sm font-semibold"><RefreshCw aria-hidden size={15} />Retry</button></div> : <form onSubmit={save} className="mt-5 space-y-6">
      {!saved.can_edit ? <p className="rounded-field bg-subtle p-3 text-sm text-muted">Only workspace owners can change the AI model. Current selection: <strong className="text-ink-2">{PROVIDERS.find((item) => item.id === saved.provider)?.label} · {saved.model}</strong>.</p> : null}

      <Step number={1} title="Choose a provider" done>
        <fieldset disabled={!editable}><legend className="sr-only">Provider</legend><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{PROVIDERS.map((item) => <label key={item.id} className={cx("flex min-h-16 cursor-pointer items-center gap-3 rounded-field border px-3 py-3", provider === item.id ? "border-accent bg-accent-wash" : "border-border bg-card", !editable && "cursor-default opacity-70")}><input type="radio" name="llm-provider" value={item.id} checked={provider === item.id} onChange={() => choose(item.id)} className="h-4 w-4 shrink-0 accent-accent" /><span><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-xs text-muted">{item.note}</span></span></label>)}</div></fieldset>
      </Step>

      <Step number={2} title={cloud ? `Connect ${meta.name}` : "Check the Ollama server"} done={connected}>
        {cloud ? <div className="max-w-xl">
          <label htmlFor="llm-api-key" className="mb-2 block text-xs font-bold text-ink-2">{hasKey ? "API key (a key is already saved)" : "API key"}</label>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-64"><input id="llm-api-key" type={showKey ? "text" : "password"} value={key} onChange={(event) => { setKey(event.target.value); setModels(null); setConnectError(""); setMessage(""); }} disabled={!editable || !saved.key_storage_ready} minLength={10} maxLength={4096} autoComplete="new-password" spellCheck={false} placeholder={hasKey ? "Leave blank to use the saved key" : "Paste your API key"} className={`${FIELD} pr-12`} /><button type="button" aria-label={showKey ? "Hide API key" : "Show API key"} disabled={!editable || !key} onClick={() => setShowKey((value) => !value)} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-field text-muted disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent">{showKey ? <EyeOff aria-hidden size={17} /> : <Eye aria-hidden size={17} />}</button></div>
            <button type="button" onClick={() => void connect(provider, key, model)} disabled={!canConnect} className="inline-flex min-h-11 items-center gap-2 rounded-field border border-accent px-4 text-sm font-bold text-accent-ink hover:bg-accent-wash disabled:cursor-not-allowed disabled:opacity-50">{connecting ? <LoaderCircle aria-hidden size={16} className="animate-spin" /> : <PlugZap aria-hidden size={16} />}{connecting ? "Connecting…" : connected ? "Reconnect" : "Connect"}</button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">Connecting only asks {meta.name} which models your key can use. It is free and nothing is saved until you press Save. Keys are encrypted on the server and never shown again.</p>
          {hasKey ? <button type="button" onClick={remove} disabled={!editable} className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-muted underline underline-offset-4 disabled:opacity-50"><Trash2 aria-hidden size={14} />Remove saved key</button> : null}
          {!saved.key_storage_ready ? <p role="alert" className="mt-2 rounded-field border border-border bg-subtle p-3 text-sm">Secure key storage isn’t set up on this server yet. An administrator needs to configure the encryption key before cloud providers can be used.</p> : null}
        </div> : <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">No API key needed. Uses the Ollama server installed alongside RivalPulse.</p>
          <button type="button" onClick={() => void connect("ollama", "", model)} disabled={!canConnect} className="inline-flex min-h-11 items-center gap-2 rounded-field border border-border px-3 text-xs font-semibold text-ink-2 hover:bg-subtle disabled:opacity-50">{connecting ? <LoaderCircle aria-hidden size={14} className="animate-spin" /> : <RefreshCw aria-hidden size={14} />}{connecting ? "Checking…" : "Check again"}</button>
        </div>}
        {connected && !connectError ? <p role="status" className="mt-2 flex items-center gap-2 text-sm text-accent-ink"><Check aria-hidden size={16} />{cloud ? "Connected" : "Ollama is running"} · {models.length} {models.length === 1 ? "model" : "models"} available</p> : null}
        {connectError ? <p role="alert" className="mt-2 text-sm text-ink-2">{!cloud && /reachable/i.test(connectError) ? "Ollama isn’t running on this server. Choose a cloud provider instead." : connectError}</p> : null}
      </Step>

      <Step number={3} title="Choose a model" done={connected && Boolean(model)}>
        <div className="max-w-xl">
          {connected && models.length && !manual ? <Select label="Model" value={model} onChange={(value) => { setModel(value); setMessage(""); }} options={options} disabled={!editable} />
            : manual || (connected && !models.length) ? <input aria-label="Model ID" value={model} onChange={(event) => { setModel(event.target.value); setMessage(""); }} disabled={!editable} required maxLength={100} pattern={MODEL_ID} spellCheck={false} autoComplete="off" placeholder="e.g. claude-haiku-4-5" className={FIELD} />
            : <p className="rounded-field bg-subtle p-3 text-sm text-muted">{model ? <>Current model: <strong className="text-ink-2">{model}</strong>. </> : null}{!editable ? null : cloud ? `Connect ${meta.name} to see the models your key can use.` : connecting ? "Checking the Ollama server…" : "Check the Ollama server to see installed models."}</p>}
          {editable && (connected || manual) ? <button type="button" onClick={() => setManual((value) => !value)} className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-muted underline underline-offset-4">{manual ? "Pick from the list instead" : "Model not listed? Enter its ID"}</button> : null}
        </div>
      </Step>

      <div className="space-y-3 border-t border-divider pt-5">
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setMessage(""); }} disabled={!editable} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" /><span>Use AI for explanations and chat<span className="mt-1 block text-xs leading-relaxed text-muted">When off, investigations still collect Sectors evidence and show rule-based summaries. Investigations already running keep the model they started with.</span></span></label>
        {cloud ? <label className="flex items-start gap-3 rounded-field border border-border bg-subtle/50 p-3 text-sm"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setMessage(""); }} disabled={!editable} required={enabled} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" /><span>Allow RivalPulse to send research to {meta.name}<span className="mt-1 block text-xs leading-relaxed text-muted">Research excerpts, company context and chat messages are processed under {meta.name}’s data policy. Usage is billed to your {meta.name} account, separately from Sectors credits. Viewing saved reports never calls the AI.</span></span></label> : null}
      </div>
      {error ? <p role="alert" className="text-sm text-ink-2">{error}</p> : null}
      {message ? <p role="status" className="flex items-start gap-2 text-sm text-accent-ink"><Check aria-hidden size={16} className="mt-0.5 shrink-0" />{message}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-divider pt-4"><button type="submit" disabled={!editable || !dirty || !model.trim() || (cloud && enabled && (!consent || (!hasKey && !key) || !saved.key_storage_ready))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-field bg-accent px-5 text-sm font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">{busy ? <LoaderCircle aria-hidden size={16} className="animate-spin" /> : null}{busy ? "Saving…" : "Save AI settings"}</button><p className="text-xs text-muted">Saving doesn’t contact the provider.</p></div>
    </form>}
  </Card>;
}
