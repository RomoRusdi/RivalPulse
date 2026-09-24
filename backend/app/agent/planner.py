from dataclasses import dataclass, field


@dataclass
class ResearchTask:
    name: str
    company: str


@dataclass
class ResearchPlan:
    target: str
    competitors: list[str]
    tasks: list[ResearchTask] = field(default_factory=list)


class ResearchPlanner:
    """
    Creates a deterministic research plan from company names.

    The planner does NOT resolve tickers.
    Yahoo Finance is responsible for resolving company names
    into Yahoo symbols.
    """

    def create_plan(
        self,
        company: str,
        competitors: list[str],
    ) -> ResearchPlan:

        target = company.strip()

        if not target:
            raise ValueError("Research target company cannot be empty.")

        normalized_competitors = []

        for competitor in competitors:
            competitor = competitor.strip()

            if not competitor:
                continue

            if competitor.lower() == target.lower():
                continue

            if not any(
                competitor.lower() == existing.lower()
                for existing in normalized_competitors
            ):
                normalized_competitors.append(competitor)

        tasks = self._build_tasks(
            target=target,
            competitors=normalized_competitors,
        )

        return ResearchPlan(
            target=target,
            competitors=normalized_competitors,
            tasks=tasks,
        )

    def _build_tasks(
        self,
        target: str,
        competitors: list[str],
    ) -> list[ResearchTask]:

        tasks = []

        companies = [target] + competitors

        for company in companies:
            tasks.append(
                ResearchTask(
                    name="get_company",
                    company=company,
                )
            )

            tasks.append(
                ResearchTask(
                    name="get_financials",
                    company=company,
                )
            )

            tasks.append(
                ResearchTask(
                    name="get_industry",
                    company=company,
                )
            )

            tasks.append(
                ResearchTask(
                    name="get_news",
                    company=company,
                )
            )

        return tasks