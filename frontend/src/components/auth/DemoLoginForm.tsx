"use client";
import { useState } from "react";
import { apiRequest, loginDestination } from "@/lib/http";

export function DemoLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return <form className="mx-auto flex max-w-[380px] flex-col gap-5" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(null);
    const token = new FormData(event.currentTarget).get("token");
    try {
      if (process.env.NEXT_PUBLIC_USE_MOCKS !== "true") await apiRequest("/demo/login", { method: "POST", body: JSON.stringify({ token }) });
      window.location.assign(loginDestination());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Access denied."); setBusy(false); }
  }}>
    <h1 className="text-[28px] font-extrabold">Private demo</h1>
    <p className="text-sm text-muted">This installation uses shared demo access. Account login is available in account mode.</p>
    {process.env.NEXT_PUBLIC_USE_MOCKS !== "true" && <label className="flex flex-col gap-2 text-sm font-semibold">Demo access token<input type="password" name="token" required minLength={16} autoComplete="off" className="rounded-field border border-border bg-subtle p-3" /></label>}
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    <button disabled={busy} className="rounded-field bg-accent p-3 font-bold text-white">{busy ? "Opening…" : "Open demo"}</button>
  </form>;
}
