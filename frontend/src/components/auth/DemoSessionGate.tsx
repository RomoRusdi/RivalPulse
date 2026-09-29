"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { checkDemoSession } from "@/lib/api";

/** Prevent the app store from loading private workspace data before login. */
export function DemoSessionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "redirecting" | "unavailable">("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    checkDemoSession().then((result) => {
      if (!active) return;
      if (result === "authenticated") setStatus("ready");
      else if (result === "unauthorized") {
        setStatus("redirecting");
        router.replace("/login");
      } else setStatus("unavailable");
    });
    return () => { active = false; };
  }, [router, attempt]);

  if (status === "ready") return children;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-5 text-center">
      {status === "unavailable" ? (
        <>
          <p className="text-sm font-bold text-ink">The workspace is unavailable</p>
          <p className="max-w-sm text-sm text-muted">Check the local backend connection, then try again.</p>
          <button type="button" onClick={() => { setStatus("checking"); setAttempt((n) => n + 1); }} className="cursor-pointer rounded-field bg-ink-strong px-4 py-2 text-sm font-bold text-white">Retry connection</button>
        </>
      ) : (
        <><LoaderCircle aria-hidden size={21} className="animate-spin text-accent" /><p className="text-sm text-muted">Checking your demo session…</p></>
      )}
    </main>
  );
}
