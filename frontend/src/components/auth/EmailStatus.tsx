"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/http";
import { Card, CardHeader, Button } from "@/components/ui/primitives";
import { EmailVerification, type VerificationChallenge } from "./EmailVerification";

export function EmailStatus() {
  const auth = useAuth();
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return <Card><CardHeader title="Email verification" />
    {auth.profile.emailVerified ? <p className="text-sm text-muted">Your account email is verified.</p> : challenge ? <EmailVerification initial={challenge} onVerified={() => { setChallenge(null); void auth.refresh().catch(() => setError("Email verified. Refresh to update your profile.")); }} /> : <>
      <p className="mb-4 text-sm leading-relaxed text-muted">Confirm access to your account email. Your existing workspace and research remain available.</p>
      <Button disabled={busy} onClick={async () => { setBusy(true); setError(null); try { const result = await apiRequest("/api/v1/auth/verification/start", { method: "POST" }) as VerificationChallenge; if (result.verificationRequired) setChallenge(result); else await auth.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send verification email."); } finally { setBusy(false); } }}>{busy ? "Sending…" : "Verify my email"}</Button>
    </>}
    {error ? <p role="alert" className="mt-3 text-sm text-accent-ink">{error}</p> : null}
  </Card>;
}
