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
      <PageTitle>Something failed to load</PageTitle>
      <Card className="min-w-0 max-w-[60ch] border-accent-wash-border bg-accent-wash">
        <Eyebrow className="text-accent-ink">Data unavailable</Eyebrow>
        <p className="mt-2 text-[15px] leading-[1.55]">
          Part of this view could not be fetched. Nothing cached has been shown
          in place of fresh data.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          {error.message || "Unknown error"}
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
