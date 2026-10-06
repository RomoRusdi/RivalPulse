"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/http";

export type VerificationChallenge = { verificationRequired: boolean; challengeId: string; expiresAt: string; resendAfter: string };

export function EmailVerification({ initial, onVerified }: { initial: VerificationChallenge; onVerified?: () => void }) {
  const [challenge, setChallenge] = useState(initial);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const wait = Math.max(0, Math.ceil((Date.parse(challenge.resendAfter) - now) / 1000));
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (success) return <div role="status" className="mx-auto w-full max-w-[380px] space-y-4"><h1 className="text-2xl font-extrabold">Email verified</h1><p className="text-sm text-muted">Your email is confirmed. Log in to open your workspace.</p><Link href="/login" className="inline-flex min-h-11 items-center rounded-field bg-accent px-5 font-bold text-white">Continue to login</Link></div>;
  return <form className="mx-auto flex w-full max-w-[380px] flex-col gap-5" aria-busy={busy} onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try {
      await apiRequest("/api/v1/auth/verification/check", { method: "POST", body: JSON.stringify({ challenge_id: challenge.challengeId, code }) });
      if (onVerified) onVerified(); else setSuccess(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification could not be completed."); }
    finally { setBusy(false); }
  }}>
    <div><h1 className="text-[28px] font-extrabold tracking-tight">Check your email</h1><p className="mt-2 text-sm leading-relaxed text-muted">If your address is eligible, you’ll receive an eight-digit code. Enter it within 15 minutes to confirm your email.</p></div>
    <label className="flex flex-col gap-2 text-sm font-semibold">Verification code<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} required disabled={busy} className="min-h-12 rounded-field border border-border bg-subtle px-4 text-lg tracking-[0.25em] outline-none focus:border-accent" /></label>
    {error ? <p role="alert" className="rounded-field bg-accent-wash p-3 text-sm text-accent-ink">{error}</p> : null}
    <button disabled={busy || code.length !== 8} className="min-h-11 rounded-field bg-accent px-4 py-3 font-bold text-white transition-console hover:bg-accent-hover disabled:opacity-50">{busy ? "Checking…" : "Verify email"}</button>
    <button type="button" disabled={busy || wait > 0} onClick={async () => {
      setBusy(true); setError(null);
      try { setChallenge(await apiRequest("/api/v1/auth/verification/resend", { method: "POST", body: JSON.stringify({ challenge_id: challenge.challengeId }) }) as VerificationChallenge); setCode(""); setNow(Date.now()); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resend the code."); }
      finally { setBusy(false); }
    }} className="min-h-11 font-semibold text-accent-ink disabled:text-muted">{wait ? `Resend code in ${wait}s` : "Send another code"}</button>
    <p className="text-xs leading-relaxed text-muted">Check spam or junk folders. If you entered the wrong address, <a href="/signup" className="font-semibold text-accent-ink">start again</a>.</p>
  </form>;
}
