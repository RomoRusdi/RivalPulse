import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { FaultyTerminal } from "@/components/auth/FaultyTerminal";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to RivalPulse and pick up where your competitive-intelligence agent left off.",
};

/**
 * The sign-in screen.
 *
 * Rendered outside the app shell (see `(app)/layout.tsx`), so there is no
 * sidebar, no top bar and no store fetching data for a visitor who has not
 * signed in.
 *
 * Everything in the right-hand panel is marketing copy with sample data.
 * Never hydrate it from a real workspace before authentication.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-8">
      <div className="flex w-full max-w-[1120px] flex-wrap items-stretch overflow-hidden rounded-frame border border-border-frame bg-surface shadow-frame">
        {/* Form column */}
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-9 px-[clamp(24px,5vw,56px)] py-10">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-[17px] font-extrabold tracking-[-0.02em]">
              RivalPulse
            </span>
          </div>

          <div className="my-auto w-full">
            <LoginForm />
          </div>

          <p className="text-xs text-muted-strong">
            Information and analysis only. Not investment advice.
          </p>
        </div>

        {/* Brand panel — hidden below 768px so the form gets the whole screen */}
        <div className="relative hidden min-h-[560px] min-w-0 flex-[1_1_400px] flex-col justify-center gap-7 overflow-hidden bg-ink-strong px-[clamp(24px,4vw,48px)] py-10 text-surface md:flex">
          <FaultyTerminal tint="#E2650F" bg="#1F1E1C" cell={14} brightness={1} />

          {/* Readability scrim — keeps the copy at 4.5:1 over the animation.
              Do not remove it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 75% 60% at 45% 50%, rgba(31,30,28,0.78) 0%, rgba(31,30,28,0.35) 60%, rgba(31,30,28,0) 100%)",
            }}
          />

          <div className="relative">
            <p className="mb-2.5 text-xs font-bold tracking-[0.1em] text-accent uppercase">
              While you were away
            </p>
            <p className="max-w-[18ch] text-[26px] leading-[1.2] font-extrabold tracking-[-0.03em]">
              Competitor moves, explained with verified financials.
            </p>
          </div>

          <div className="relative flex flex-col gap-3 rounded-card bg-card p-[18px] text-ink">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-wash px-3 py-[5px] text-xs font-bold text-accent-ink">
                High
              </span>
              <span className="text-[13px] font-extrabold">ISAT</span>
              <span className="ml-auto text-[13px] text-muted">18 Sep</span>
            </div>
            <p className="text-base leading-[1.35] font-bold">
              Enterprise AI distribution partnership announced
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-subtle px-3 py-[5px] text-xs font-bold text-ink-2">
                Fact · Rev +12.8% YoY
              </span>
              <span className="rounded-full bg-subtle px-3 py-[5px] text-xs font-bold text-ink-2">
                3 sources
              </span>
            </div>
          </div>

          <dl className="relative flex flex-wrap gap-x-6.5 gap-y-4">
            {[
              { value: "2", label: "New signals" },
              { value: "3", label: "Companies tracked" },
              { value: "09:14", label: "Last agent run (WIB)" },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="text-[26px] font-extrabold tracking-[-0.03em]">
                  {stat.value}
                </dd>
                <dt className="text-xs text-muted-on-dark">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
