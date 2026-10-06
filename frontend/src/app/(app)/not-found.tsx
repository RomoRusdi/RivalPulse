import { ButtonLink, PageTitle } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <>
      <PageTitle>Finding unavailable</PageTitle>
      <p className="max-w-[52ch] text-sm leading-[1.55] text-muted">
        This finding isn’t available in your workspace. Return to your findings
        to review the available evidence.
      </p>
      <div>
        <ButtonLink href="/signals" variant="primary">
          Back to findings
        </ButtonLink>
      </div>
    </>
  );
}
