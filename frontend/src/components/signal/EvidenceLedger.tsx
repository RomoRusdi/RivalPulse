import { EVIDENCE_LABEL, Eyebrow, cx } from "@/components/ui/primitives";
import type { Evidence } from "@/lib/types";

/**
 * The evidence ledger.
 *
 * The dark treatment for hypotheses is deliberate and load-bearing: an
 * unverified interpretation must never be able to look like a verified fact.
 * Keep this distinction if this component is ever restyled.
 */
export function EvidenceLedger({ evidence }: { evidence: Evidence[] }) {
  return (
    <ol className="flex min-w-0 flex-[1.3_1_360px] list-none flex-col gap-3">
      {evidence.map((item, index) => {
        const isHypothesis = item.kind === "hypothesis";
        return (
          <li
            key={index}
            className={cx(
              "rounded-detail p-4",
              isHypothesis
                ? "bg-ink-strong text-surface"
                : "border border-border bg-card",
            )}
          >
            <Eyebrow className={isHypothesis ? "text-accent" : "text-muted"}>
              {EVIDENCE_LABEL[item.kind]}
              {item.kind !== "hypothesis" ? ` · ${item.source}` : null}
            </Eyebrow>
            <p className="mt-1.5 text-[15px] leading-[1.55]">{item.text}</p>
          </li>
        );
      })}
    </ol>
  );
}
