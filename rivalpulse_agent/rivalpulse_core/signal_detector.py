"""Transparent deterministic signal, confidence, and implication rules."""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import re

from .analyzer import AnalysisBundle
from .schemas import (
    CompanyComparison,
    CompetitiveSignal,
    MarketingImplication,
    ResearchState,
    SignalSeverity,
    SourceType,
)


@dataclass(slots=True)
class DetectionBundle:
    signals: list[CompetitiveSignal] = field(default_factory=list)
    implications: list[MarketingImplication] = field(default_factory=list)


class CompetitiveSignalDetector:
    """Create signals only when explicit, inspectable thresholds are met."""

    EVENT_RULES = (
        ("pricing", ("price", "pricing", "tariff", "package", "plan", "discount", "promo", "bundle", "kuota")),
        ("partnership", ("partnership", "partner", "collaboration", "agreement", "alliance", "memorandum", "mou")),
        ("product", ("launch", "product", "service", "feature", "network", "5g", "platform", "application")),
        ("campaign", ("campaign", "brand", "sponsor", "advertising", "activation")),
    )

    def detect(self, state: ResearchState, analysis: AnalysisBundle) -> DetectionBundle:
        output = DetectionBundle()
        for comparison in analysis.comparisons:
            signal = self._detect_comparison_signal(state, analysis, comparison, len(output.signals) + 1)
            if signal is None:
                continue
            output.signals.append(signal)
            output.implications.append(self._build_implication(signal))
        for signal in self._detect_event_signals(state, analysis):
            output.signals.append(signal)
            output.implications.append(self._build_implication(signal))
        return output

    def _detect_comparison_signal(
        self,
        state: ResearchState,
        analysis: AnalysisBundle,
        comparison: CompanyComparison,
        sequence: int,
    ) -> CompetitiveSignal | None:
        available_competitors = [item for item in comparison.competitors if item.value is not None]
        if comparison.target.value is None or not available_competitors:
            return None

        target = comparison.target
        strongest_competitor = max(
            available_competitors,
            key=lambda item: item.value if item.value is not None else float("-inf"),
        )
        target_value = target.value or 0
        competitor_value = strongest_competitor.value or 0

        if comparison.metric == "recent_activity":
            all_values = [target, *available_competitors]
            leader = max(all_values, key=lambda item: item.value if item.value is not None else -1)
            runner_up_values = [item.value or 0 for item in all_values if item.company != leader.company]
            gap = (leader.value or 0) - max(runner_up_values, default=0)
            if gap < 2:
                return None
            severity = SignalSeverity.MEDIUM if gap >= 4 else SignalSeverity.LOW
            companies = list(dict.fromkeys([state.request.target_company, leader.company]))
            interpretation = (
                f"{leader.company}'s higher event cadence may indicate a more active period of "
                "launches, partnerships, or corporate communication."
            )
            why_it_matters = (
                "A sustained increase in competitor communication can change campaign timing, "
                "share of voice, and the themes marketing teams need to monitor."
            )
            title = f"{leader.company} shows elevated market activity"
            evidence_companies = companies
            signal_type = "market_activity"
        elif comparison.unit == "%":
            gap = abs(target_value - competitor_value)
            if gap < 3:
                return None
            severity = self._financial_severity(gap)
            leader = target if target_value >= competitor_value else strongest_competitor
            trailer = strongest_competitor if leader.company == target.company else target
            title = f"{leader.company} leads on {comparison.label.lower()}"
            interpretation = (
                f"{leader.company} is ahead of {trailer.company} by {gap:.1f} percentage points "
                f"on the available {comparison.label.lower()} measure."
            )
            why_it_matters = self._financial_relevance(comparison.metric)
            companies = list(dict.fromkeys([target.company, strongest_competitor.company]))
            evidence_companies = companies
            if comparison.metric in {"operating_margin", "gross_margin", "profit_margin"}:
                signal_type = "profitability"
            elif comparison.metric == "fifty_two_week_change":
                signal_type = "market_performance"
            elif comparison.metric == "dividend_yield":
                signal_type = "shareholder_return"
            else:
                signal_type = "growth"
        else:
            return None

        evidence_map = analysis.evidence_by_metric.get(comparison.metric, {})
        evidence_ids = [evidence_map[company] for company in evidence_companies if company in evidence_map]
        if not evidence_ids:
            return None

        stable_key = self._stable_key(
            comparison.metric,
            companies,
        )
        return CompetitiveSignal(
            id=f"SIG-{stable_key[:12].upper()}",
            stable_key=stable_key,
            type=signal_type,
            severity=severity,
            title=title,
            companies=companies,
            observation=comparison.observation,
            evidence_ids=evidence_ids,
            interpretation=interpretation,
            why_it_matters=why_it_matters,
            confidence=self._confidence(state, analysis, comparison, evidence_ids),
        )

    def _detect_event_signals(
        self,
        state: ResearchState,
        analysis: AnalysisBundle,
    ) -> list[CompetitiveSignal]:
        signals: list[CompetitiveSignal] = []
        source_lookup = {source.id: source for source in state.sources}
        source_scores = {
            SourceType.SECTORS: 0.90,
            SourceType.NEWS: 0.85,
            SourceType.OTHER: 0.60,
            SourceType.FIXTURE: 0.50,
        }
        for ticker in state.plan.companies:
            for item in state.news_data.get(ticker, [])[:10]:
                text = f"{item.title} {item.summary or ''}".casefold()
                category = next(
                    (
                        name
                        for name, keywords in self.EVENT_RULES
                        if any(re.search(rf"\b{re.escape(keyword)}\b", text) for keyword in keywords)
                    ),
                    None,
                )
                if category is None:
                    continue
                evidence_map = analysis.evidence_by_metric.get(
                    f"news_event:{ticker}:{item.source_ref}",
                    {},
                )
                evidence_id = evidence_map.get(ticker)
                if evidence_id is None:
                    continue
                identity = "|".join(
                    [
                        category,
                        ticker,
                        re.sub(r"[^a-z0-9]+", " ", item.title.casefold()).strip(),
                        item.published_at.date().isoformat(),
                    ]
                )
                stable_key = hashlib.sha256(identity.encode("utf-8")).hexdigest()
                severity = {
                    "pricing": SignalSeverity.HIGH,
                    "partnership": SignalSeverity.MEDIUM,
                    "product": SignalSeverity.MEDIUM,
                    "campaign": SignalSeverity.LOW,
                }[category]
                interpretation = {
                    "pricing": "This activity may indicate a change in value positioning or customer-acquisition emphasis; the commercial effect is not yet verified.",
                    "partnership": "This relationship may expand reach, capability, or credibility; strategic intent is not established by the announcement alone.",
                    "product": "This activity may change the competitor's offer or messaging priorities; customer adoption is not yet known.",
                    "campaign": "This activity may affect share of voice or category framing; campaign impact is not yet verified.",
                }[category]
                why_it_matters = {
                    "pricing": "Marketing should monitor offer framing, target segments, channels, and whether competitors respond with matching claims.",
                    "partnership": "Marketing should monitor the audiences, proof points, and distribution advantages emphasized in follow-up communication.",
                    "product": "Marketing should compare the announced proposition with current positioning and watch for repeated customer-benefit claims.",
                    "campaign": "Marketing should track message repetition, audience focus, and changes in competitive share of voice.",
                }[category]
                source = source_lookup.get(item.source_ref)
                quality = source_scores.get(source.type, 0.55) if source else 0.55
                signals.append(
                    CompetitiveSignal(
                        id=f"SIG-{stable_key[:12].upper()}",
                        stable_key=stable_key,
                        type=category,
                        severity=severity,
                        title=f"{ticker} {category} activity detected",
                        companies=[ticker],
                        observation=(
                            f"{item.source_name} published ‘{item.title}’ on "
                            f"{item.published_at.date().isoformat()}."
                        ),
                        evidence_ids=[evidence_id],
                        interpretation=interpretation,
                        why_it_matters=why_it_matters,
                        confidence=round(min(0.55 + 0.35 * quality, 0.90), 2),
                    )
                )
        return signals

    @staticmethod
    def _stable_key(metric: str, companies: list[str]) -> str:
        identity = f"{metric}|{'|'.join(sorted(companies))}"
        return hashlib.sha256(identity.encode("utf-8")).hexdigest()

    @staticmethod
    def _financial_severity(gap: float) -> SignalSeverity:
        if gap >= 10:
            return SignalSeverity.HIGH
        if gap >= 5:
            return SignalSeverity.MEDIUM
        return SignalSeverity.LOW

    @staticmethod
    def _financial_relevance(metric: str) -> str:
        if metric in {"operating_margin", "gross_margin", "profit_margin"}:
            return (
                "A material margin difference may affect how aggressively each company can support "
                "acquisition, retention, and brand activity."
            )
        if metric == "fifty_two_week_change":
            return (
                "A material market-performance gap can indicate changing investor expectations, "
                "but should not be treated as direct evidence of operating performance."
            )
        if metric == "dividend_yield":
            return (
                "A dividend-yield difference can shape investor positioning and corporate narrative, "
                "although it does not measure business growth."
            )
        return (
            "Growth divergence can precede shifts in campaign intensity, category claims, "
            "partnership messaging, and customer-acquisition narratives."
        )

    @staticmethod
    def _confidence(
        state: ResearchState,
        analysis: AnalysisBundle,
        comparison: CompanyComparison,
        evidence_ids: list[str],
    ) -> float:
        values = [comparison.target, *comparison.competitors]
        completeness = sum(item.value is not None for item in values) / len(values)
        evidence_lookup = {item.id: item for item in analysis.evidence}
        source_lookup = {source.id: source for source in state.sources}
        source_scores = {
            SourceType.FIXTURE: 0.5,
            SourceType.SECTORS: 0.9,
            SourceType.NEWS: 0.85,
            SourceType.OTHER: 0.65,
        }
        referenced_sources = [
            source_lookup[source_id]
            for evidence_id in evidence_ids
            for source_id in evidence_lookup[evidence_id].source_refs
            if source_id in source_lookup
        ]
        source_quality = (
            sum(source_scores[source.type] for source in referenced_sources) / len(referenced_sources)
            if referenced_sources
            else 0
        )
        evidence_support = min(len(evidence_ids) / 2, 1)
        score = 0.42 + (0.23 * completeness) + (0.10 * evidence_support) + (0.15 * source_quality)
        return round(min(score, 0.95), 2)

    @staticmethod
    def _build_implication(signal: CompetitiveSignal) -> MarketingImplication:
        leader = signal.title.split(" ", 1)[0]
        if signal.type in {"pricing", "partnership", "product", "campaign"}:
            implication = signal.why_it_matters
            monitoring = {
                "pricing": ["Offer framing", "Target segments", "Competitor response"],
                "partnership": ["Distribution reach", "Joint proof points", "Follow-up launches"],
                "product": ["Customer benefits", "Adoption evidence", "Positioning changes"],
                "campaign": ["Message repetition", "Audience focus", "Share of voice"],
            }[signal.type]
        elif signal.type == "market_activity":
            implication = (
                f"Monitor {leader}'s announcements for repeated themes before changing messaging "
                "in response to a single event."
            )
            monitoring = ["Partnerships", "Product launches", "Expansion language"]
        elif signal.type == "profitability":
            implication = (
                "Track whether the profitability difference is followed by changes in campaign "
                "intensity, promotional posture, or value positioning."
            )
            monitoring = ["Promotional activity", "Value claims", "Campaign intensity"]
        elif signal.type in {"market_performance", "shareholder_return"}:
            implication = (
                "Treat the market metric as context and verify it against operating results before "
                "changing competitive messaging."
            )
            monitoring = ["Investor narrative", "Earnings releases", "Market expectations"]
        else:
            implication = (
                f"Review how {leader} frames growth, customer momentum, and scale before the next "
                "positioning cycle."
            )
            monitoring = ["Campaign claims", "Acquisition messaging", "Quarterly narrative"]

        return MarketingImplication(
            signal_id=signal.id,
            implication=implication,
            recommended_monitoring=monitoring,
        )
