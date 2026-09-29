"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { signInDemo, USE_MOCKS } from "@/lib/api";

/** The current backend has a private demo token, not email/password accounts. */
export function LoginForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!USE_MOCKS && token.trim().length < 16) {
      setError("Enter the private access token (at least 16 characters).");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signInDemo(token.trim());
      setToken("");
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-[380px] flex-col gap-5.5">
      <div>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.035em]">
          {USE_MOCKS ? "Preview RivalPulse" : "Sign in to your workspace"}
        </h1>
        <p className="mt-1.5 text-sm leading-[1.5] text-muted">
          {USE_MOCKS
            ? "Explore the interface with sample data. No account is needed."
            : "This local demo uses a private access token, not an email account."}
        </p>
      </div>

      {!USE_MOCKS ? (
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink-2">
          Access token
          <span className="flex items-center rounded-field border border-border bg-subtle transition-console focus-within:border-accent focus-within:bg-card focus-within:shadow-[0_0_0_3px_var(--color-accent-wash)]">
            <input
              type={showToken ? "text" : "password"}
              autoComplete="current-password"
              value={token}
              onChange={(event) => { setToken(event.target.value); setError(null); }}
              disabled={submitting}
              aria-invalid={Boolean(error)}
              aria-describedby="login-token-hint"
              className="min-h-11 min-w-0 flex-1 bg-transparent px-3.5 py-2.75 text-sm text-ink outline-none placeholder:text-muted disabled:cursor-wait"
              placeholder="Private local access token"
            />
            <button
              type="button"
              onClick={() => setShowToken((visible) => !visible)}
              aria-label={showToken ? "Hide access token" : "Show access token"}
              aria-pressed={showToken}
              className="cursor-pointer px-3.5 py-2 text-ink-2 hover:text-ink"
            >
              {showToken ? <EyeOff aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
            </button>
          </span>
          <span id="login-token-hint" className="text-[12px] font-normal leading-[1.5] text-muted">
            Find it in <code>backend/.env</code> as <code>DEMO_ACCESS_TOKEN</code>. Keep it private.
          </span>
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-field border border-accent-wash-border bg-accent-wash px-3.5 py-2.5 text-[13px] text-accent-ink">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field bg-accent px-4 py-3 text-[15px] font-bold text-white transition-console hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-80"
      >
        {submitting ? <><LoaderCircle aria-hidden size={16} className="animate-spin" /> Signing in…</> : USE_MOCKS ? "Open preview" : "Continue to workspace"}
      </button>

      <p className="text-[12px] leading-[1.5] text-muted">
        {USE_MOCKS ? "Preview data is illustrative." : "Access is shared within this local demo workspace. Individual accounts and Google sign-in are not configured."}
      </p>
    </form>
  );
}
