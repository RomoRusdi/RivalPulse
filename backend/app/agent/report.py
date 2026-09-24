import json
import logging
from typing import Any

from app.agent.schemas import (
    CompanySnapshot,
    FinancialContext,
    MarketingImplication,
    Signal,
)

logger = logging.getLogger("rivalpulse.report")


class ReportGenerator:

    def __init__(self, llm):
        self.llm = llm

    async def generate(
        self,
        company: str,
        competitors: list[str],
        company_snapshot: CompanySnapshot,
        financial_context: FinancialContext,
        comparisons: list[dict],
        signals: list[Signal],
        sources: list[dict],
    ) -> tuple[str, list[MarketingImplication]]:

        # =========================================================
        # Prepare deterministic research data
        # =========================================================

        compact_data = {
            "company": company,

            "competitors": competitors,

            "company_snapshot": {
                "company_name": (
                    company_snapshot.company_name
                ),
                "ticker": company_snapshot.ticker,
                "sector": company_snapshot.sector,
                "industry": company_snapshot.industry,
                "country": company_snapshot.country,
            },

            "financial_context": {
                "revenue": financial_context.revenue,
                "revenue_growth_pct": (
                    financial_context.revenue_growth_pct
                ),
                "net_income": financial_context.net_income,
                "net_income_growth_pct": (
                    financial_context.net_income_growth_pct
                ),
                "currency": financial_context.currency,
                "period": financial_context.period,
            },

            "competitor_comparison": comparisons,

            "signals": [
                {
                    "type": signal.type,
                    "severity": signal.severity,
                    "title": signal.title,
                    "description": signal.description,
                    "confidence": signal.confidence,
                    "evidence": [
                        {
                            "source": evidence.source,
                            "field": evidence.field,
                            "value": evidence.value,
                            "comparison": evidence.comparison,
                        }
                        for evidence in signal.evidence[:3]
                    ],
                }
                for signal in signals[:10]
            ],

            # Only send a small number of sources to LLM.
            # The actual source list remains in ResearchResult.
            "sources": [
                {
                    "ticker": source.get("ticker"),
                    "title": source.get("title"),
                    "source": source.get("source"),
                    "published_at": source.get(
                        "published_at"
                    ),
                }
                for source in sources[:5]
            ],
        }

        # =========================================================
        # System prompt
        # =========================================================

        system_prompt = """
You are RivalPulse, an AI competitive intelligence
assistant for marketing teams.

Your task is to interpret structured research data.

IMPORTANT RULES:

1. Use ONLY the supplied research data.
2. Do NOT invent financial numbers.
3. Do NOT invent company information.
4. Do NOT invent news.
5. Do NOT invent sources.
6. Do NOT provide investment advice.
7. Do NOT provide buy/sell recommendations.
8. Do NOT make predictions about stock prices.
9. Do NOT create signals yourself.
10. Signals in the input are deterministic findings from
    the research pipeline.
11. Do NOT repeat the entire financial context.
12. Do NOT repeat the entire competitor comparison.
13. Do NOT list all sources.
14. Explain what the findings could mean for marketing.
15. Marketing implications must be framed as potential
    implications, not guaranteed outcomes.
16. Keep the summary concise.
17. Return ONLY valid JSON.
18. Do not use Markdown.
19. Do not wrap the JSON in ``` fences.

Required JSON format:

{
  "summary": "string",
  "marketing_implications": [
    {
      "title": "string",
      "description": "string",
      "supporting_signals": ["string"]
    }
  ]
}
"""

        # =========================================================
        # User prompt
        # =========================================================

        prompt = f"""
Analyze the following RivalPulse research data.

RESEARCH DATA:

{json.dumps(
    compact_data,
    ensure_ascii=False,
    indent=2,
    default=str,
)}

Your response must contain ONLY this JSON structure:

{{
  "summary": "A concise 2-4 sentence synthesis of the most important findings.",
  "marketing_implications": [
    {{
      "title": "Short implication title",
      "description": "Explain a potential marketing implication based directly on the supplied signals and evidence.",
      "supporting_signals": ["Exact signal title"]
    }}
  ]
}}

SUMMARY REQUIREMENTS:

- Focus on the most important observed findings.
- Mention the target company and relevant competitor.
- Mention financial trends only when values are available.
- Mention detected signals only when they exist.
- Do not invent missing information.
- Do not say that a company has positive or negative sentiment
  unless the supplied data explicitly supports that.
- Do not discuss unrelated companies.

MARKETING IMPLICATION REQUIREMENTS:

- Generate 1-3 implications.
- Each implication must be supported by an existing signal.
- Do not create a new signal.
- Do not simply repeat the signal description.
- Explain why the finding may matter to a marketing team.
- Use cautious language such as "could", "may", or
  "suggests a potential".
"""

        logger.info(
            "REPORT_LLM_REQUEST company=%s",
            company,
        )

        response = await self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
        )

        logger.info(
            "REPORT_LLM_RESPONSE chars=%d",
            len(response),
        )

        # =========================================================
        # Parse JSON
        # =========================================================

        parsed = self._parse_json(response)

        summary = str(
            parsed.get("summary") or ""
        ).strip()

        if not summary:
            summary = self._fallback_summary(
                company=company,
                competitors=competitors,
                financial_context=financial_context,
                signals=signals,
            )

        raw_implications = parsed.get(
            "marketing_implications",
            [],
        )

        implications = []

        if isinstance(
            raw_implications,
            list,
        ):

            valid_signal_titles = {
                signal.title
                for signal in signals
            }

            for item in raw_implications:

                if not isinstance(
                    item,
                    dict,
                ):
                    continue

                title = str(
                    item.get("title") or ""
                ).strip()

                description = str(
                    item.get("description") or ""
                ).strip()

                if not title or not description:
                    continue

                supporting_signals = (
                    item.get(
                        "supporting_signals",
                        [],
                    )
                )

                if not isinstance(
                    supporting_signals,
                    list,
                ):
                    supporting_signals = []

                # Only keep signals that actually exist
                # in deterministic backend output.
                supporting_signals = [
                    str(signal_title)
                    for signal_title
                    in supporting_signals
                    if str(signal_title)
                    in valid_signal_titles
                ]

                implications.append(
                    MarketingImplication(
                        title=title,
                        description=description,
                        supporting_signals=(
                            supporting_signals
                        ),
                    )
                )

        # =========================================================
        # Fallback if Qwen returned no implications
        # =========================================================

        if not implications and signals:

            for signal in signals[:3]:

                implications.append(
                    MarketingImplication(
                        title=(
                            f"Marketing implication: "
                            f"{signal.title}"
                        ),
                        description=(
                            "This finding could be relevant "
                            "to competitive positioning and "
                            "marketing planning. Further "
                            "validation with campaign, customer, "
                            "and market data would be needed "
                            "before treating it as a business "
                            "conclusion."
                        ),
                        supporting_signals=[
                            signal.title
                        ],
                    )
                )

        logger.info(
            "REPORT_COMPLETED summary_chars=%d "
            "implications=%d",
            len(summary),
            len(implications),
        )

        return summary, implications

    # =============================================================
    # JSON PARSER
    # =============================================================

    @staticmethod
    def _parse_json(
        response: str,
    ) -> dict[str, Any]:

        text = response.strip()

        # Remove Markdown fences if Qwen ignores instructions.
        if text.startswith("```"):
            lines = text.splitlines()

            if lines:
                lines = lines[1:]

            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]

            text = "\n".join(lines).strip()

        # First attempt: complete JSON.
        try:
            result = json.loads(text)

            if isinstance(
                result,
                dict,
            ):
                return result

        except json.JSONDecodeError:
            pass

        # Second attempt: find JSON object.
        start = text.find("{")
        end = text.rfind("}")

        if start != -1 and end > start:

            candidate = text[
                start:end + 1
            ]

            try:
                result = json.loads(
                    candidate
                )

                if isinstance(
                    result,
                    dict,
                ):
                    return result

            except json.JSONDecodeError:
                pass

        logger.warning(
            "REPORT_JSON_PARSE_FAILED response=%r",
            response[:1000],
        )

        return {}

    # =============================================================
    # FALLBACK SUMMARY
    # =============================================================

    @staticmethod
    def _fallback_summary(
        company: str,
        competitors: list[str],
        financial_context: FinancialContext,
        signals: list[Signal],
    ) -> str:

        parts = []

        if competitors:
            parts.append(
                f"Research for {company} compares "
                f"the company with "
                f"{', '.join(competitors)}."
            )
        else:
            parts.append(
                f"Research was conducted for {company}."
            )

        if (
            financial_context.revenue_growth_pct
            is not None
        ):
            parts.append(
                "Revenue growth was "
                f"{financial_context.revenue_growth_pct:.2f}%."
            )

        if (
            financial_context.net_income_growth_pct
            is not None
        ):
            parts.append(
                "Net income growth was "
                f"{financial_context.net_income_growth_pct:.2f}%."
            )

        if signals:
            parts.append(
                f"{len(signals)} deterministic "
                "competitive signal(s) were detected."
            )

        return " ".join(parts)