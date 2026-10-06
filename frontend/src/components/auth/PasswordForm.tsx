"use client";

import { useState } from "react";
import { Button, Card, CardHeader } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";

export function PasswordForm() {
  const { changePassword } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    if (data.get("next") !== data.get("confirm")) { setError("Passwords do not match."); return; }
    setBusy(true);
    try { await changePassword(String(data.get("current")), String(data.get("next"))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change password."); setBusy(false); }
  };
  return <Card>
    <CardHeader title="Change password" />
    <form onSubmit={submit} aria-busy={busy} className="flex max-w-lg flex-col gap-3.5">
      <p className="text-sm text-muted">Use 15–128 characters. You will need to log in again on every device.</p>
      <fieldset disabled={busy} className="flex flex-col gap-3.5">
        {[
          { name: "current", label: "Current password", complete: "current-password", min: 1 },
          { name: "next", label: "New password", complete: "new-password", min: 15 },
          { name: "confirm", label: "Confirm new password", complete: "new-password", min: 15 },
        ].map(field => <label key={field.name} className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
          {field.label}<input name={field.name} type="password" autoComplete={field.complete} required minLength={field.min} maxLength={128} className="rounded-field border border-border bg-subtle px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:bg-card" />
        </label>)}
      </fieldset>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div><Button type="submit" variant="primary" disabled={busy}>{busy ? "Updating…" : "Update password and sign out"}</Button></div>
    </form>
  </Card>;
}
