"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest, broadcastAuthChange, loginDestination, saveLoginSession } from "@/lib/http";

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <form className="mx-auto flex w-full max-w-[380px] flex-col gap-5" aria-busy={busy} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      const result = await apiRequest("/api/v1/auth/login", { method: "POST", body: JSON.stringify({
        email: data.get("email"), password: data.get("password"), remember: data.get("remember") === "on",
      }) });
      saveLoginSession(result);
      broadcastAuthChange();
      window.location.assign(loginDestination());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not log in."); setBusy(false); }
  }}>
    <div><h1 className="text-[28px] font-extrabold tracking-[-0.035em]">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">Log in to continue your workspace’s research.</p></div>
    <fieldset disabled={busy} className="flex flex-col gap-4">
      <label className="rp-field-focus flex flex-col gap-2 text-[13px] font-semibold">Work email
        <input name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" className={FIELD} /></label>
      <label className="flex flex-col gap-2 text-[13px] font-semibold">Password
        <span className="rp-field-focus flex rounded-field border border-border bg-subtle focus-within:border-accent">
          <input name="password" type={show ? "text" : "password"} required maxLength={128} autoComplete="current-password" className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm outline-none" />
          <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="cursor-pointer px-3">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </span></label>
      <label className="flex items-center gap-2 text-sm"><input name="remember" type="checkbox" className="accent-accent" />Keep me signed in</label>
      <p className="text-xs leading-relaxed text-muted">Leave unchecked to require login when you close this tab and open RivalPulse again.</p>
    </fieldset>
    {error && <p role="alert" className="rounded-field bg-accent-wash p-3 text-sm text-accent-ink">{error}</p>}
    <button disabled={busy} className="rp-press cursor-pointer rounded-field bg-accent px-4 py-3 font-bold text-white hover:bg-accent-hover disabled:opacity-60"><span className="rp-text-chunk" key={String(busy)}>{busy ? "Logging in…" : "Log in"}</span></button>
    <p className="text-[13px] text-muted">New to RivalPulse? <Link href="/signup" className="font-semibold text-accent-ink">Create an account</Link></p>
  </form>;
}
const FIELD = "rounded-field border border-border bg-subtle px-3.5 py-3 text-sm outline-none focus:border-accent focus:bg-card";
