import { FileSearch, Layers3, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { FaultyTerminal } from "@/components/auth/FaultyTerminal";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-5 py-8">
      <div className="flex w-full max-w-[1120px] flex-wrap items-stretch overflow-hidden rounded-frame border border-border-frame bg-surface shadow-frame">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-9 px-[clamp(24px,5vw,56px)] py-10">
          <div className="flex items-center gap-2.5"><Logo size={26} /><span className="text-[17px] font-extrabold tracking-[-0.02em]">RivalPulse</span></div>
          <div className="my-auto w-full">{children}</div>
          <p className="text-xs text-muted-strong">Information and analysis only. Not investment advice.</p>
        </div>
        <div className="relative hidden min-h-[560px] min-w-0 flex-[1_1_400px] flex-col justify-center gap-8 overflow-hidden bg-ink-strong px-[clamp(24px,4vw,48px)] py-10 text-surface md:flex">
          <FaultyTerminal tint="#146c50" bg="#122d23" cell={14} brightness={1} />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-ink-strong/80" />
          <div className="relative">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-accent-bright">Competitive intelligence</p>
            <p className="max-w-[19ch] text-[32px] font-extrabold leading-[1.16] tracking-[-0.03em]">Keep your next move grounded in evidence.</p>
            <p className="mt-4 max-w-[40ch] text-sm leading-relaxed text-muted-on-dark">Follow competitor activity, compare financial context, and review the sources behind every finding.</p>
          </div>
          <div className="relative flex flex-col gap-4 border-t border-white/15 pt-6">
            {[
              { icon: Layers3, title: "Your competitive landscape", body: "A focused watchlist for the companies that matter to you." },
              { icon: FileSearch, title: "Research you can trace", body: "Cited evidence and clearly marked gaps in source coverage." },
              { icon: ShieldCheck, title: "Clarity before action", body: "Facts, observations, and AI hypotheses kept distinct." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-field border border-white/15 bg-white/5 text-accent-bright"><Icon aria-hidden size={17} /></span>
                <div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-[13px] leading-relaxed text-muted-on-dark">{body}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

