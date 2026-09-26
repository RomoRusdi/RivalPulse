"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cx } from "@/components/ui/primitives";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared field chrome so the email and password inputs cannot drift apart. */
const FIELD =
  "w-full rounded-field border bg-subtle px-3.5 py-2.75 text-sm text-ink outline-none transition-console placeholder:text-muted min-h-11 sm:min-h-0 " +
  "focus:border-accent focus:bg-card focus:shadow-[0_0_0_3px_var(--color-accent-wash)]";

export function LoginForm({ showSSO = true }: { showSSO?: boolean }) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  const [authError, setAuthError] = useState<string | null>(null);

  const validate = () => {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = "Enter your work email.";
    else if (!EMAIL_RE.test(email.trim()))
      next.email = "Enter a valid email address.";
    if (!password) next.password = "Enter your password.";
    return next;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setAuthError(null);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    // TODO: replace with POST /auth/login once the backend exists. The password
    // is deliberately kept on a failed attempt — retyping it helps nobody.
    await new Promise((resolve) => setTimeout(resolve, 900));
    setSubmitting(false);
    router.push("/");
  };

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-[380px] flex-col gap-5.5"
    >
      <div>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.035em]">
          Sign in to your workspace
        </h1>
        <p className="mt-1.5 text-sm leading-[1.5] text-muted">
          Pick up where your agent left off.
        </p>
      </div>

      {showSSO ? (
        <div className="flex flex-col gap-3.5">
          <button
            type="button"
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-field border border-border bg-card px-4 py-2.75 text-sm font-semibold transition-console hover:bg-[#F4F2EE] active:scale-[0.99]"
          >
            <GoogleMark />
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-strong">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3.5">
        <label htmlFor={emailId} className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink-2">
            Work email
          </span>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@company.co.id"
            value={email}
            readOnly={submitting}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? `${emailId}-error` : undefined}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => {
              if (email.trim() && !EMAIL_RE.test(email.trim()))
                setErrors((p) => ({
                  ...p,
                  email: "Enter a valid email address.",
                }));
              else setErrors((p) => ({ ...p, email: undefined }));
            }}
            className={cx(FIELD, errors.email ? "border-error" : "border-border")}
          />
          {errors.email ? (
            <FieldError id={`${emailId}-error`}>{errors.email}</FieldError>
          ) : null}
        </label>

        <label htmlFor={passwordId} className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between gap-3 text-[13px] font-semibold text-ink-2">
            Password
            <Link
              href="/login"
              className="font-semibold text-accent-ink no-underline transition-console hover:text-accent"
            >
              Forgot password?
            </Link>
          </span>
          <span
            className={cx(
              "flex items-center rounded-field border bg-subtle transition-console focus-within:border-accent focus-within:bg-card focus-within:shadow-[0_0_0_3px_var(--color-accent-wash)]",
              errors.password ? "border-error" : "border-border",
            )}
          >
            <input
              id={passwordId}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              readOnly={submitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? `${passwordId}-error` : undefined
              }
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 min-w-0 flex-1 bg-transparent px-3.5 py-2.75 text-sm text-ink outline-none placeholder:text-muted sm:min-h-0"
            />
            {/* A real button, so it is reachable and announced. */}
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="cursor-pointer px-3.5 py-2 text-[13px] font-semibold text-ink-2 transition-console select-none hover:text-ink"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
          {errors.password ? (
            <FieldError id={`${passwordId}-error`}>
              {errors.password}
            </FieldError>
          ) : null}
        </label>

        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink-2">
          <input
            type="checkbox"
            defaultChecked
            className="h-4 w-4 accent-accent"
          />
          Keep me signed in for 30 days
        </label>
      </div>

      {/* Generic on purpose — never reveal which field was wrong. */}
      {authError ? (
        <p
          role="alert"
          className="rounded-field border border-accent-wash-border bg-accent-wash px-3.5 py-2.5 text-[13px] text-accent-ink"
        >
          {authError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-field bg-accent px-4 py-3 text-[15px] font-bold text-white transition-console hover:bg-accent-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-80"
      >
        {submitting ? (
          <>
            <Spinner />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>

      <p className="text-[13px] text-muted">
        New to RivalPulse?{" "}
        <Link
          href="/login"
          className="font-semibold text-accent-ink no-underline transition-console hover:text-accent"
        >
          Create a workspace
        </Link>
      </p>
    </form>
  );
}

function FieldError({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <span id={id} className="text-xs text-error">
      {children}
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

/** The official Google "G", inline so it needs no network request. */
function GoogleMark() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
