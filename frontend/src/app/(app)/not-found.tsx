import { ButtonLink, PageTitle } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <>
      <PageTitle>Signal not found</PageTitle>
      <p className="max-w-[52ch] text-sm leading-[1.55] text-muted">
        This signal is not in the current research state. It may belong to an
        older run, or the stored state may have been rebuilt since the link was
        shared.
      </p>
      <div>
        <ButtonLink href="/signals" variant="primary">
          Back to signals
        </ButtonLink>
      </div>
    </>
  );
}
