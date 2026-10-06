"""Deterministic research planning for predictable hackathon execution."""

from .schemas import DataKind, PlanStep, ResearchPlan, ResearchRequest, SourceType


class DeterministicResearchPlanner:
    """Requests the normalized datasets required by the core research flow."""

    def create_plan(self, request: ResearchRequest) -> ResearchPlan:
        companies = [request.target_company, *request.competitors]
        return ResearchPlan(
            companies=companies,
            required_data=[
                DataKind.COMPANY,
                DataKind.FINANCIALS,
                DataKind.INDUSTRY,
                DataKind.NEWS,
            ],
            steps=[
                PlanStep(
                    sequence=1,
                    action="resolve_scope",
                    reason="Freeze the target and competitor set before collecting evidence.",
                ),
                PlanStep(
                    sequence=2,
                    action="collect_financial_context",
                    reason="Sectors financial context is mandatory for strategic interpretation.",
                    required_source=SourceType.SECTORS,
                ),
                PlanStep(
                    sequence=3,
                    action="collect_competitive_activity",
                    reason="Gather bounded company news and public activity for every company.",
                ),
                PlanStep(
                    sequence=4,
                    action="compare_previous_state",
                    reason="Distinguish baseline, new, updated, and unchanged findings.",
                ),
                PlanStep(
                    sequence=5,
                    action="score_and_explain",
                    reason="Apply deterministic thresholds before grounded AI interpretation.",
                ),
            ],
        )
