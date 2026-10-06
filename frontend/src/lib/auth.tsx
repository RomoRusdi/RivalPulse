"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { UserProfileSchema } from "./schemas";
import { apiRequest, ApiError, broadcastAuthChange, cancelAccountRequests, clearTabSession, DEMO_MODE } from "./http";
import { DemoSessionGate } from "@/components/auth/DemoSessionGate";
import { clearLocalState } from "./persistence";

export const AccountSchema = UserProfileSchema.extend({ workspaceId: z.string(), sessionExpiresAt: z.string(), emailVerified: z.boolean().default(false), remembered: z.boolean().default(true) });
export type Account = z.infer<typeof AccountSchema>;
type AuthValue = {
  profile: Account;
  updateProfile: (patch: Pick<Account, "name" | "timezone">) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);

function clearAccountCache(scope: string | null) {
  if (scope) {
    clearLocalState(scope);
    try { window.localStorage.removeItem(`rivalpulse.chat-history.v1:${scope}`); } catch { /* Storage is optional. */ }
  }
  clearLocalState();
}

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  return DEMO_MODE ? <DemoSessionGate>{children}</DemoSessionGate> : <AuthProvider>{children}</AuthProvider>;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const identity = useRef<string | null>(null);
  const redirecting = useRef(false);
  const [profile, setProfile] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const redirect = useCallback(() => {
    if (redirecting.current) return;
    redirecting.current = true;
    cancelAccountRequests();
    clearTabSession();
    clearAccountCache(identity.current);
    setProfile(null);
    window.location.replace(new URL(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`, window.location.origin).href);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const account = AccountSchema.parse(await apiRequest("/api/v1/auth/me"));
        if (!cancelled && !redirecting.current) {
          const nextIdentity = `${account.id}:${account.workspaceId}`;
          if (identity.current && identity.current !== nextIdentity) cancelAccountRequests();
          identity.current = nextIdentity;
          setProfile(account); setError(null);
        }
      } catch (cause) {
        if (cancelled || redirecting.current) return;
        if (cause instanceof ApiError && cause.status === 401) redirect();
        else { setProfile(null); setError(cause instanceof Error ? cause.message : "Could not load your account."); }
      }
    };
    const changed = (event: StorageEvent) => {
      if (event.key === "rivalpulse.auth.changed") window.location.reload();
    };
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(visible, 60_000);
    window.addEventListener("rivalpulse:session-expired", redirect);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("rivalpulse:session-expired", redirect);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
    };
  }, [attempt, redirect]);

  if (!profile) return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="rounded-card border border-border bg-surface p-8 text-center">
        <p role={error ? "alert" : "status"}>{error ?? "Loading your workspace…"}</p>
        {error && <button className="mt-4 cursor-pointer font-bold text-accent-ink" onClick={() => setAttempt(n => n + 1)}>Try again</button>}
      </div>
    </main>
  );

  const leave = () => {
    redirecting.current = true;
    cancelAccountRequests();
    clearTabSession();
    clearAccountCache(`${profile.id}:${profile.workspaceId}`);
    broadcastAuthChange();
    setProfile(null);
    window.location.replace(new URL("/login", window.location.origin).href);
  };
  const value: AuthValue = {
    profile,
    refresh: async () => { setProfile(AccountSchema.parse(await apiRequest("/api/v1/auth/me"))); },
    updateProfile: async patch => {
      const updated = AccountSchema.parse(await apiRequest("/api/v1/users/me", { method: "PATCH", body: JSON.stringify(patch) }));
      setProfile(updated);
    },
    logout: async () => { await apiRequest("/api/v1/auth/logout", { method: "POST" }); leave(); },
    changePassword: async (current, next) => {
      await apiRequest("/api/v1/auth/change-password", { method: "POST", body: JSON.stringify({ current_password: current, new_password: next }) });
      leave();
    },
  };
  return <AuthContext.Provider key={`${profile.id}:${profile.workspaceId}`} value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("Account context is required");
  return auth;
}
