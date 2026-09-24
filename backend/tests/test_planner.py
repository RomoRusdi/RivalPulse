import pytest

from app.agent.planner import ResearchPlanner


@pytest.fixture
def planner():
    return ResearchPlanner()


def test_one_company(planner):
    plan = planner.create_plan(
        "Research ISAT"
    )

    assert plan.target == "ISAT"
    assert plan.competitors == []

    assert [
        (task.name, task.ticker)
        for task in plan.tasks
    ] == [
        ("get_company", "ISAT"),
        ("get_financials", "ISAT"),
        ("get_industry", "ISAT"),
    ]


def test_one_company_one_competitor(planner):
    plan = planner.create_plan(
        "Research ISAT compared with TLKM"
    )

    assert plan.target == "ISAT"
    assert plan.competitors == ["TLKM"]

    assert [
        (task.name, task.ticker)
        for task in plan.tasks
    ] == [
        ("get_company", "ISAT"),
        ("get_financials", "ISAT"),
        ("get_industry", "ISAT"),
        ("get_company", "TLKM"),
        ("get_financials", "TLKM"),
        ("get_industry", "TLKM"),
    ]


def test_one_company_multiple_competitors(planner):
    plan = planner.create_plan(
        "Research ISAT compared with TLKM and EXCL"
    )

    assert plan.target == "ISAT"
    assert plan.competitors == [
        "TLKM",
        "EXCL",
    ]

    assert [
        (task.name, task.ticker)
        for task in plan.tasks
    ] == [
        ("get_company", "ISAT"),
        ("get_financials", "ISAT"),
        ("get_industry", "ISAT"),
        ("get_company", "TLKM"),
        ("get_financials", "TLKM"),
        ("get_industry", "TLKM"),
        ("get_company", "EXCL"),
        ("get_financials", "EXCL"),
        ("get_industry", "EXCL"),
    ]