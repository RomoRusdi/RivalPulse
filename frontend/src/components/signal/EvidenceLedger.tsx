"use client";

import { useState } from "react";
import { EVIDENCE_LABEL, Eyebrow, cx } from "@/components/ui/primitives";
import { isCannedHypothesis } from "@/lib/format";
import type { Evidence } from "@/lib/types";

/**
 * The evidence ledger.
 *
 * Backend-built annual figures ("revenue for 2024: …") repeat once per metric
 * per period and are already tabulated in Financial context — listing all of
 * them here buries the actual observations. They collapse into one summary
 * row (expandable), while prose facts, observed signals and hypotheses always
 * render in full.
 *
 * Live observation texts embed their headline at the start (the page title
 * already shows it), so the duplicated lead is replaced with the company
 * name. Canned fallback sentences carry no information and are hidden
 * entirely — the evidence they cite stays visible.
 *
 * The dark treatment for hypotheses is deliberate and load-bearing: an
 * unverified interpretation must never be able to look like a verified fact.
 * Keep this distinction if this component is ever restyled.
 */
const FINANCIAL_FACT = /^(revenue|earnings|total_assets|total_equity|ebitda|revenue_growth_percent)\s+for\s+\d{4}\s*:/i;

export function EvidenceLedger({
  evidence,
  company,
  headline,
}: {
  evidence: Evidence[];
  company: string;
  headline: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const figures = evidence.filter(
    (item) => item.kind === "fact" && FINANCIAL_FACT.test(item.text),
  );
  const rest = evidence.filter(
    (item) =>
      !(item.kind === "fact" && FINANCIAL_FACT.test(item.text)) &&
      !(item.kind === "hypothesis" && isCannedHypothesis(item.text)),
  );

  return (
    <ol className="flex min-w-0 flex-[1.3_1_360px] list-none flex-col gap-3">
      {rest.map((item, index) => {
        const isHypothesis = item.kind === "hypothesis";
        const body =
          !isHypothesis && headline && item.text.startsWith(headline)
            ? item.text.slice(headline.length).replace(/^[-–—:·\s]+/, "")
            : item.text;
        const showCompany = body !== item.text;
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
            {showCompany ? (
              <p className="mt-1.5 text-[15px] font-bold leading-[1.45]">{company}</p>
            ) : null}
            <p className={cx("leading-[1.55]", showCompany ? "mt-1 text-[14px]" : "mt-1.5 text-[15px]")}>{body}</p>
          </li>
        );
      })}
      {figures.length > 0 ? (
        <li className="rounded-detail border border-border bg-card p-4">
          <Eyebrow className="text-muted">
            {EVIDENCE_LABEL.fact} · {figures[0].source}
          </Eyebrow>
          <p className="mt-1.5 text-[15px] leading-[1.55]">
            {figures.length} cited annual {figures.length === 1 ? "figure" : "figures"} —
            tabulated in Financial context, not repeated here.
          </p>
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="mt-2 cursor-pointer text-[13px] font-bold text-accent-ink transition-console hover:text-accent"
          >
            {expanded ? "Hide figures" : "Show figures"}
          </button>
          {expanded ? (
            <ul className="mt-3 flex flex-col gap-2 border-t border-divider pt-3">
              {figures.map((item, index) => (
                <li key={index} className="text-[13px] leading-[1.5] text-ink-2">
                  {item.text}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ) : null}
    </ol>
  );
}
