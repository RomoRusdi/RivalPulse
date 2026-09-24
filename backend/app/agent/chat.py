from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.agent.schemas import (
    ChatRequest,
    ChatResponse,
    ResearchResult,
)
from app.agent.agent import ResearchAgent
from app.llm.base import LLMProvider


logger = logging.getLogger(__name__)


class ChatAgent:
    """
    Natural-language chat layer for RivalPulse.

    The user does not need to provide a ticker.

    Company names are extracted from the user's message and then
    passed to ResearchAgent, which ultimately resolves the company
    through Yahoo Finance.
    """

    def __init__(
        self,
        llm: LLMProvider,
        research_agent: ResearchAgent,
    ):
        self.llm = llm
        self.research_agent = research_agent

    # =========================================================
    # MAIN CHAT
    # =========================================================

    async def chat(
        self,
        request: ChatRequest,
    ) -> ChatResponse:

        message = request.message.strip()

        if not message:
            return ChatResponse(
                message="Please enter a message.",
                intent="general",
                suggestions=[],
            )

        logger.info(
            "Processing chat message: %s",
            message,
        )

        # =====================================================
        # 1. TRY DETERMINISTIC COMPARISON PARSING
        # =====================================================
        #
        # For simple requests such as:
        #
        #   compare BCA to BRI
        #   BCA vs BRI
        #   BCA versus BRI
        #   compare BCA with BRI
        #
        # we do NOT ask the LLM to decide the companies.
        #
        # This prevents Qwen from turning:
        #
        #   BCA -> BRI
        #   BRI -> Bri
        #   Bri -> BMY
        #
        # =====================================================

        direct_comparison = (
            self._extract_direct_comparison(
                message
            )
        )

        if direct_comparison is not None:

            company = direct_comparison[
                "company"
            ]

            competitors = direct_comparison[
                "competitors"
            ]

            logger.info(
                "DIRECT_COMPARISON "
                "company=%s competitors=%s",
                company,
                competitors,
            )

            result = (
                await self.research_agent.run_research(
                    company=company,
                    competitors=competitors,
                )
            )

            explanation = (
                await self._explain_research(
                    user_message=message,
                    result=result,
                )
            )

            return ChatResponse(
                message=explanation,
                intent="research",
                research_result=result,
                suggestions=self._suggestions(
                    result
                ),
            )

        # =====================================================
        # 2. LLM RESEARCH PARSER
        # =====================================================

        research_request = (
            await self._extract_research_request(
                message
            )
        )

        if research_request is not None:

            company = research_request[
                "company"
            ]

            competitors = research_request[
                "competitors"
            ]

            logger.info(
                "Research request detected: "
                "company=%s competitors=%s",
                company,
                competitors,
            )

            result = (
                await self.research_agent.run_research(
                    company=company,
                    competitors=competitors,
                )
            )

            explanation = (
                await self._explain_research(
                    user_message=message,
                    result=result,
                )
            )

            return ChatResponse(
                message=explanation,
                intent="research",
                research_result=result,
                suggestions=self._suggestions(
                    result
                ),
            )

        # =====================================================
        # 3. FOLLOW-UP
        # =====================================================

        if request.previous_result is not None:

            logger.info(
                "Handling follow-up question."
            )

            response = await self._follow_up(
                request=request,
                result=request.previous_result,
            )

            return ChatResponse(
                message=response,
                intent="follow_up",
                research_result=(
                    request.previous_result
                ),
                suggestions=self._suggestions(
                    request.previous_result
                ),
            )

        # =====================================================
        # 4. GENERAL CHAT
        # =====================================================

        response = await self._general_chat(
            request
        )

        return ChatResponse(
            message=response,
            intent="general",
            suggestions=[
                "Research a company and its competitors",
                "Compare two companies",
                "Show recent news about a company",
            ],
        )

    # =========================================================
    # DIRECT COMPARISON PARSER
    # =========================================================

    def _extract_direct_comparison(
        self,
        message: str,
    ) -> dict[str, Any] | None:
        """
        Deterministically extract simple company comparisons.

        Examples:

            compare BCA to BRI
            compare BCA with BRI
            BCA vs BRI
            BCA versus BRI
            BCA against BRI
            compare BCA against BRI

        Returns:

            {
                "company": "BCA",
                "competitors": ["BRI"]
            }

        This method does NOT resolve company names into tickers.
        Yahoo Finance remains responsible for company resolution.
        """

        text = message.strip()

        if not text:
            return None

        # -----------------------------------------------------
        # Normalize whitespace
        # -----------------------------------------------------

        text = re.sub(
            r"\s+",
            " ",
            text,
        ).strip()

        # -----------------------------------------------------
        # Pattern 1:
        #
        # compare BCA to BRI
        # compare BCA with BRI
        # compare BCA against BRI
        #
        # Also supports:
        #
        # compare BCA to BRI and Mandiri
        # compare BCA with BRI and Mandiri
        # -----------------------------------------------------

        pattern_compare = re.compile(
            r"""
            ^\s*
            (?:please\s+)?
            compare
            \s+
            (?P<target>.+?)
            \s+
            (?P<operator>
                to
                |
                with
                |
                against
                |
                versus
                |
                vs\.?
            )
            \s+
            (?P<competitors>.+?)
            \s*$
            """,
            flags=re.IGNORECASE | re.VERBOSE,
        )

        match = pattern_compare.match(
            text
        )

        if match:

            target = self._clean_company_name(
                match.group("target")
            )

            competitors = (
                self._split_companies(
                    match.group(
                        "competitors"
                    )
                )
            )

            if target and competitors:

                competitors = [
                    competitor
                    for competitor in competitors
                    if competitor.lower()
                    != target.lower()
                ]

                if competitors:

                    return {
                        "company": target,
                        "competitors": competitors,
                    }

        # -----------------------------------------------------
        # Pattern 2:
        #
        # BCA vs BRI
        # BCA vs. BRI
        # BCA versus BRI
        # BCA against BRI
        # -----------------------------------------------------

        pattern_simple = re.compile(
            r"""
            ^\s*
            (?P<target>.+?)
            \s+
            (?P<operator>
                vs\.?
                |
                versus
                |
                against
            )
            \s+
            (?P<competitors>.+?)
            \s*$
            """,
            flags=re.IGNORECASE | re.VERBOSE,
        )

        match = pattern_simple.match(
            text
        )

        if match:

            target = self._clean_company_name(
                match.group("target")
            )

            competitors = (
                self._split_companies(
                    match.group(
                        "competitors"
                    )
                )
            )

            if target and competitors:

                competitors = [
                    competitor
                    for competitor in competitors
                    if competitor.lower()
                    != target.lower()
                ]

                if competitors:

                    return {
                        "company": target,
                        "competitors": competitors,
                    }

        return None

    # =========================================================
    # COMPANY NAME CLEANING
    # =========================================================

    @staticmethod
    def _clean_company_name(
        value: str,
    ) -> str:
        """
        Remove unnecessary conversational wording around
        a company name while preserving the actual user input.
        """

        value = value.strip()

        # Remove common trailing punctuation.
        value = re.sub(
            r"[?.!,;:]+$",
            "",
            value,
        )

        # Remove common comparison wording accidentally
        # captured at the beginning.
        value = re.sub(
            r"^(?:the\s+)?company\s+",
            "",
            value,
            flags=re.IGNORECASE,
        )

        return value.strip()

    # =========================================================
    # SPLIT COMPANIES
    # =========================================================

    @staticmethod
    def _split_companies(
        value: str,
    ) -> list[str]:
        """
        Split multiple competitor names.

        Examples:

            BRI
            BRI and Mandiri
            BRI, Mandiri
            BRI, Mandiri, BNI

        This does not use a predefined company list.
        """

        value = value.strip()

        if not value:
            return []

        # Normalize "and" between company names.
        value = re.sub(
            r"\s+and\s+",
            ",",
            value,
            flags=re.IGNORECASE,
        )

        parts = [
            part.strip()
            for part in value.split(",")
        ]

        result = []

        for part in parts:

            part = re.sub(
                r"[?.!,;:]+$",
                "",
                part,
            ).strip()

            if not part:
                continue

            if not any(
                part.lower() == existing.lower()
                for existing in result
            ):
                result.append(part)

        return result

    # =========================================================
    # LLM RESEARCH PARSER
    # =========================================================

    async def _extract_research_request(
        self,
        message: str,
    ) -> dict[str, Any] | None:
        """
        Ask the LLM to determine whether the user's message
        is a research request.

        The LLM only extracts company names.

        It must NOT resolve them into tickers.
        """

        system_prompt = """
You are the request parser for RivalPulse.

Your ONLY job is to identify whether the user's message
requests company research, competitive intelligence,
financial comparison, company news, industry information,
or competitor analysis.

Return ONLY valid JSON.

If the message is a research request, return:

{
  "is_research": true,
  "company": "target company name",
  "competitors": [
    "competitor company name"
  ]
}

If it is NOT a research request, return:

{
  "is_research": false,
  "company": "",
  "competitors": []
}

STRICT RULES:

1. Extract company names from the user's message.

2. Preserve the user's company names whenever possible.

3. Do NOT convert company names into stock tickers.

4. Do NOT invent companies.

5. Do NOT replace one company with another company.

6. Do NOT use your own knowledge to correct or substitute
   a company name.

7. Do NOT use a predefined company list.

8. Do NOT add competitors that the user did not mention.

9. If the user explicitly compares two companies,
   the first company is the target.

10. If the user says:
    "compare BCA to BRI"

    return exactly:

    {
      "is_research": true,
      "company": "BCA",
      "competitors": ["BRI"]
    }

11. If the user says:
    "BCA vs Mandiri"

    return:

    {
      "is_research": true,
      "company": "BCA",
      "competitors": ["Mandiri"]
    }

12. If the user says:
    "compare Telkom with Indosat and XL"

    return:

    {
      "is_research": true,
      "company": "Telkom",
      "competitors": ["Indosat", "XL"]
    }

13. Never output:
    BBCA.JK
    BBRI.JK
    BMRI.JK

    because ticker resolution is handled separately
    by Yahoo Finance.

14. Never output unrelated companies such as:
    BMY
    BAC
    BCAT

    unless the user explicitly mentioned them.

15. If only one company is mentioned and the user clearly
    asks for research about that company, use an empty
    competitors array.

16. Return JSON only.

Do not return Markdown.
Do not return explanations.
"""

        try:

            raw_response = await self.llm.generate(
                prompt=message,
                system_prompt=system_prompt,
            )

            logger.info(
                "Research parser raw response: %s",
                raw_response,
            )

            parsed = self._parse_json(
                raw_response
            )

            if not isinstance(
                parsed,
                dict,
            ):
                return None

            if not parsed.get(
                "is_research"
            ):
                return None

            company = str(
                parsed.get(
                    "company",
                    "",
                )
            ).strip()

            if not company:
                return None

            competitors = parsed.get(
                "competitors",
                [],
            )

            if not isinstance(
                competitors,
                list,
            ):
                competitors = []

            competitors = [
                str(item).strip()
                for item in competitors
                if str(item).strip()
            ]

            # -------------------------------------------------
            # Remove duplicate competitors
            # -------------------------------------------------

            unique_competitors = []

            for competitor in competitors:

                if (
                    competitor.lower()
                    == company.lower()
                ):
                    continue

                if not any(
                    competitor.lower()
                    == existing.lower()
                    for existing
                    in unique_competitors
                ):
                    unique_competitors.append(
                        competitor
                    )

            return {
                "company": company,
                "competitors": (
                    unique_competitors
                ),
            }

        except Exception as exc:

            logger.warning(
                "Could not parse research request: %s",
                exc,
            )

            return None

    # =========================================================
    # EXPLAIN RESEARCH
    # =========================================================

    async def _explain_research(
        self,
        user_message: str,
        result: ResearchResult,
    ) -> str:
        """
        Ask Qwen to explain the deterministic research result.

        Qwen does not fetch Yahoo Finance data directly.
        It only explains the structured result.
        """

        system_prompt = """
You are RivalPulse, an AI competitive intelligence assistant.

Your task is to explain research results generated from
Yahoo Finance data.

IMPORTANT:

- Use ONLY the supplied research result.
- Do not invent financial numbers.
- Do not invent news.
- Do not invent sources.
- Do not replace company names.
- Do not replace ticker symbols.
- Do not introduce companies that are not present
  in the research result.
- Clearly distinguish observed facts from interpretation.
- Marketing implications must be framed as potential
  implications, not guaranteed outcomes.
- Do not provide buy/sell recommendations.
- Do not provide financial advice.
- Keep the response concise and useful for a marketing team.

If the research result says:

company = PT Bank Central Asia Tbk

and competitor = PT Bank Rakyat Indonesia (Persero) Tbk

you MUST preserve those identities.

Do not reinterpret BCA as BRI.
Do not reinterpret BRI as BMY.
Do not substitute companies.

Answer using the supplied result only.
"""

        prompt = f"""
User request:

{user_message}

Research result:

{json.dumps(
    result.model_dump(),
    indent=2,
    ensure_ascii=False,
    default=str,
)}

Explain the findings for the user.
"""

        return await self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
        )

    # =========================================================
    # FOLLOW UP
    # =========================================================

    async def _follow_up(
        self,
        request: ChatRequest,
        result: ResearchResult,
    ) -> str:
        """
        Answer follow-up questions using the previous
        structured result.
        """

        system_prompt = """
You are RivalPulse, a competitive intelligence assistant.

Answer the user's follow-up question using ONLY the
supplied previous research result.

Rules:

- Do not invent information.
- Do not introduce unsupported financial numbers.
- Do not invent news or sources.
- Do not replace company identities.
- Do not substitute one ticker/company for another.
- If the previous research does not contain the requested
  information, clearly say that the available research
  does not contain it.
- Do not provide buy/sell recommendations.
- Do not provide financial advice.
"""

        history_text = "\n".join(
            f"{message.role}: {message.content}"
            for message
            in request.history[-10:]
        )

        prompt = f"""
Conversation history:

{history_text}

Current question:

{request.message}

Previous research result:

{json.dumps(
    result.model_dump(),
    indent=2,
    ensure_ascii=False,
    default=str,
)}

Answer the current question directly.
"""

        return await self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
        )

    # =========================================================
    # GENERAL CHAT
    # =========================================================

    async def _general_chat(
        self,
        request: ChatRequest,
    ) -> str:
        """
        Handle normal conversation that is not a research request.
        """

        system_prompt = """
You are RivalPulse, an AI competitive intelligence assistant.

You can help users understand:

- company research
- competitor comparisons
- financial context
- industry information
- company news
- marketing implications

If the user wants actual company research, ask them to
provide a company name and optionally competitor names.

Do not invent company data.
Do not provide buy/sell recommendations.
Do not provide financial advice.
"""

        history_text = "\n".join(
            f"{message.role}: {message.content}"
            for message
            in request.history[-10:]
        )

        prompt = f"""
Conversation history:

{history_text}

User:

{request.message}

Respond naturally and concisely.
"""

        return await self.llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
        )

    # =========================================================
    # JSON PARSER
    # =========================================================

    def _parse_json(
        self,
        text: str,
    ) -> dict[str, Any]:
        """
        Parse JSON returned by the LLM.

        Handles:
        - normal JSON
        - ```json ... ```
        - JSON embedded in additional text
        """

        text = text.strip()

        # -----------------------------------------------------
        # Remove Markdown code fences
        # -----------------------------------------------------

        text = re.sub(
            r"^```(?:json)?\s*",
            "",
            text,
            flags=re.IGNORECASE,
        )

        text = re.sub(
            r"\s*```$",
            "",
            text,
            flags=re.IGNORECASE,
        )

        text = text.strip()

        # -----------------------------------------------------
        # Direct JSON parsing
        # -----------------------------------------------------

        try:
            parsed = json.loads(text)

            if isinstance(
                parsed,
                dict,
            ):
                return parsed

        except json.JSONDecodeError:
            pass

        # -----------------------------------------------------
        # Extract first JSON object
        # -----------------------------------------------------

        match = re.search(
            r"\{.*\}",
            text,
            flags=re.DOTALL,
        )

        if not match:
            raise ValueError(
                "LLM did not return valid JSON."
            )

        try:
            parsed = json.loads(
                match.group(0)
            )

        except json.JSONDecodeError as exc:
            raise ValueError(
                "LLM returned malformed JSON."
            ) from exc

        if not isinstance(
            parsed,
            dict,
        ):
            raise ValueError(
                "LLM JSON response is not an object."
            )

        return parsed

    # =========================================================
    # SUGGESTIONS
    # =========================================================

    def _suggestions(
        self,
        result: ResearchResult,
    ) -> list[str]:
        """
        Generate useful follow-up suggestions
        without hardcoded tickers.
        """

        company = result.company

        suggestions = [
            f"Show recent news about {company}",
            f"Explain the financial changes for {company}",
        ]

        if result.competitors:

            competitor = (
                result.competitors[0]
            )

            suggestions.append(
                f"Compare {company} with {competitor}"
            )

        suggestions.append(
            f"What are the marketing implications for {company}?"
        )

        return suggestions[:4]