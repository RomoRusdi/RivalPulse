"use client";

import { Button, Card, Eyebrow, PageTitle } from "@/components/ui/primitives";

/**
 * A data failure names what is missing. Per the handoff: never silently
 * substitute stale data for fresh.
 */
export default function ErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <PageTitle>This page couldn’t be loaded</PageTitle>
      <Card className="min-w-0 max-w-[60ch] border-accent-wash-border bg-accent-wash">
        <Eyebrow className="text-accent-ink">Data unavailable</Eyebrow>
        <p className="mt-2 text-[15px] leading-[1.55]">
          We couldn’t load this page. Try again, or contact your administrator
          if the problem continues.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          {error.digest ? `Support reference: ${error.digest}` : "Your connection may be temporarily unavailable."}
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
      </Card>
    </>
  );
}
