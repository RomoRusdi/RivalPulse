"use client";

import { useState } from "react";
import Link from "next/link";
import { apiRequest, broadcastAuthChange, saveLoginSession } from "@/lib/http";
import { EmailVerification, type VerificationChallenge } from "./EmailVerification";
import { CompanyPicker } from "@/components/ui/CompanyPicker";
import type { Company } from "@/lib/types";

const FIELD = "w-full rounded-field border border-border bg-subtle px-3.5 py-2.75 text-sm outline-none focus:border-accent focus:bg-card";

export function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    if (data.get("password") !== data.get("confirm")) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const result = await apiRequest("/api/v1/auth/register", { method: "POST", body: JSON.stringify({
        name: data.get("name"), user_company: company?.ticker ?? null,
        email: data.get("email"), password: data.get("password"),
      }) });
      if ((result as VerificationChallenge).verificationRequired) { setChallenge(result as VerificationChallenge); setBusy(false); return; }
      saveLoginSession(result);
      broadcastAuthChange();
      window.location.assign(new URL("/", window.location.origin).href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create your account.");
      setBusy(false);
    }
  };
  if (challenge) return <EmailVerification initial={challenge} />;
  return (
    <form onSubmit={submit} aria-busy={busy} className="mx-auto flex w-full max-w-[380px] flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-extrabold tracking-[-0.035em]">Create your workspace</h1>
        <p className="mt-1.5 text-sm text-muted">Keep your team’s competitive research in one place.</p>
      </div>
      <fieldset disabled={busy} className="flex flex-col gap-3.5">
        <label className="rp-field-focus flex flex-col gap-2 text-[13px] font-semibold text-ink-2">Your name
          <input name="name" required maxLength={80} autoComplete="name" className={FIELD} />
        </label>
        <CompanyPicker value={company} onChange={setCompany} />
        <label className="rp-field-focus flex flex-col gap-2 text-[13px] font-semibold text-ink-2">Work email
          <input name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" className={FIELD} />
        </label>
        <label className="rp-field-focus flex flex-col gap-2 text-[13px] font-semibold text-ink-2">Password
          <input name="password" type={show ? "text" : "password"} required minLength={15} maxLength={128} autoComplete="new-password" aria-describedby="password-hint" className={FIELD} />
        </label>
        <p id="password-hint" className="text-xs text-muted">Use 15–128 characters. A memorable passphrase works well.</p>
        <label className="rp-field-focus flex flex-col gap-2 text-[13px] font-semibold text-ink-2">Confirm password
          <input name="confirm" type={show ? "text" : "password"} required minLength={15} maxLength={128} autoComplete="new-password" className={FIELD} />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} className="accent-accent" />Show passwords</label>
      </fieldset>
      {error && <p role="alert" className="rounded-field bg-accent-wash p-3 text-sm text-accent-ink">{error}</p>}
      <button disabled={busy} className="rp-press cursor-pointer rounded-field bg-accent px-4 py-3 font-bold text-white hover:bg-accent-hover disabled:opacity-60"><span className="rp-text-chunk" key={String(busy)}>{busy ? "Creating workspace…" : "Create account"}</span></button>
      <p className="text-[13px] text-muted">Already have an account? <Link href="/login" className="font-semibold text-accent-ink">Log in</Link></p>
    </form>
  );
}
