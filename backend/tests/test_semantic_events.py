"""Offline regressions for bounded, AI-led attribution and partial reasoning."""
import copy
import time
from types import SimpleNamespace

import pytest
from app.agent import Agent, LLMAdapter
from app.brief_projection import verified_annual_growth
from app.contracts import FinancialBrief
from app.db import session
from app.models import Run, RunSnapshot, Snapshot
from app.providers import digest
from app.research import claim_run
from app.semantic_events import MAX_REVIEWED, EventAttribution, articles_for, asked_question, news_scope, relevance, title_for, validate_attribution, window_days
from tests.conftest import launch
from tests.test_decision_support import CANDIDATE, interpretation

EXCL = dict(symbol="EXCL", name="XLSMART", aliases=["XL Axiata"])
ISAT = dict(symbol="ISAT", name="Indosat", aliases=[])
CATALOGUE = [EXCL, ISAT]


def article(text, company=EXCL, tags=None):
    return dict(article_id="saved-article", text=text, company=company,
                symbols=tags or [], source_kind="news")


def attribution(**updates):
    return EventAttribution(**{"article_id": "saved-article", "category": "Financial update",
        "role": "company_announcement", "actor_quote": "EXCL", "observation_quote": "EXCL plans capex of Rp20 trillion.",
        "rationale": "The company stated spending guidance, not a product launch.", **updates})


def test_quotes_must_be_literal_and_financial_actors_must_be_separated():
    source = article("EXCL plans capex of Rp20 trillion. ISAT plans Rp23 trillion.")
    validate_attribution(attribution(), source, CATALOGUE)
    for bad in [attribution(observation_quote="EXCL plans capex of Rp25 trillion."),
                attribution(observation_quote=source["text"]),
                attribution(actor_quote="ISAT", observation_quote="ISAT plans Rp23 trillion.")]:
        with pytest.raises(ValueError):
            validate_attribution(bad, source, CATALOGUE)


def test_commentary_is_not_a_company_launch_or_another_companys_news():
    text = "Kiwoom expects EXCL's rollout to support tower demand."
    row = attribution(category="Analyst commentary", role="third_party_commentary", actor_quote="Kiwoom", observation_quote=text)
    validate_attribution(row, article(text), CATALOGUE)
    with pytest.raises(ValueError):
        validate_attribution(row.model_copy(update={"category": "Product"}), article(text), CATALOGUE)
    with pytest.raises(ValueError):
        validate_attribution(row.model_copy(update={"observation_quote": "Kiwoom expects Indosat's rollout."}), article("Kiwoom expects Indosat's rollout."), CATALOGUE)


def test_fifty_five_saved_articles_are_bounded_fairly_without_schema_overflow(client, watchlist):
    run_id = launch(client, watchlist)
    with session() as db, db.begin():
        run = db.get(Run, run_id)
        companies = run.inputs["companies"]
        for i in range(55):
            company = companies[i % len(companies)]
            snapshot = Snapshot(company_id=company["id"], mode="replay", provider="sectors_news",
                request_key=digest([i]), content_hash=digest([i]), url="https://news.test/saved",
                normalized={"articles": [{"text": f"{company['symbol']} saved source passage {i}.",
                                        "published_at": f"2026-09-{i % 28 + 1:02d}"}]})
            db.add(snapshot)
            db.flush()
            db.add(RunSnapshot(run_id=run_id, snapshot_id=snapshot.id, outcome="fetched"))
        db.flush()
        selected, stats = articles_for(db, run)
    assert stats["available_articles"] == 55
    # Bounded to MAX_REVIEWED, one article per asked company before anyone's second.
    assert stats["selected_articles"] == MAX_REVIEWED == 6 and stats["not_reviewed"] == 49
    assert len({a["company"]["symbol"] for a in selected}) == min(MAX_REVIEWED, len(companies))


@pytest.mark.parametrize("invalid", ["semantic", "schema"])
def test_valid_ai_reasoning_survives_an_invalid_neighbour_and_one_repair(client, watchlist, invalid):
    class Mixed(LLMAdapter):
        calls = 0
        def structured(self, kind, schema, data, repair=False):
            self.calls += 1
            rows = []
            for i, candidate in enumerate(data["candidates"]):
                row = interpretation(event_key=candidate["event_key"], why_it_matters="BETA's advertised offer may be relevant if customer overlap is confirmed.").model_dump()
                if i:
                    row["potential_implication"] = "Revenue will increase 40%." if invalid == "semantic" else 42
                rows.append(row)
            return {"interpretations": rows}
    run_id = launch(client, watchlist)
    adapter = Mixed()
    agent = Agent(run_id, claim_run(run_id), adapter)
    candidates = [copy.deepcopy(CANDIDATE), {**copy.deepcopy(CANDIDATE), "event_key": "second-event"}]
    result = agent.analyze_bounded(candidates)
    assert adapter.calls == 2
    assert len(result.interpretations) == 2
    assert agent.analysis_origins == {"synthetic-event": "ai", "second-event": "rule_based"}
    assert result.interpretations[0].potential_implication is not None
    assert result.interpretations[1].potential_implication is None


def test_expired_time_and_unverified_attribution_do_not_call_model(client, watchlist):
    class Never(LLMAdapter):
        def structured(self, *args, **kwargs):
            raise AssertionError("No model call expected")
    run_id = launch(client, watchlist)
    agent = Agent(run_id, claim_run(run_id), Never())
    agent.evidence_started = time.monotonic() - 300
    result = agent.analyze_bounded([CANDIDATE])
    assert result.interpretations[0].potential_implication is None
    assert agent.analysis_fallbacks["synthetic-event"] == "analysis_timeout"
    agent.evidence_started = None
    agent.analyze_bounded([{**CANDIDATE, "classification_origin": "unverified"}])
    with session() as db:
        assert db.get(Run, run_id).llm_calls == 0


def test_saved_growth_is_recomputed_from_its_source_and_mismatched_years_are_removed():
    def brief():
        return FinancialBrief(period="2025", caveats=[], rows=[dict(symbol="EXCL", name="XLSMART", comparison_note="",
            metrics=[dict(metric="revenue_yoy_percent", value="+999%", currency=None, unit="percent", period="2025",
                comparison_basis="computed", source_url="https://news.test/report", json_pointer="/revenue", snapshot_id="saved", claim_id="growth")])])
    metrics = [dict(metric="revenue", value=value, currency=None, unit="provider_native_unspecified",
                    comparison_basis="reporting_scope_unverified", period=year) for year, value in [("2024", "100"), ("2025", "110")]]
    snapshot = SimpleNamespace(normalized={"symbol": "EXCL", "metrics": metrics})
    # The stored +999% is replaced by the value recomputed from the saved source.
    assert verified_annual_growth(brief(), {"saved": snapshot}).rows[0].metrics[0].value == "+10.00%"
    metrics[0]["unit"] = "thousands"
    assert verified_annual_growth(brief(), {"saved": snapshot}).rows[0].metrics == []
    for metric in metrics:
        metric.update(currency="IDR", unit="units", comparison_basis="consolidated")
    assert verified_annual_growth(brief(), {"saved": snapshot}).rows[0].metrics[0].value == "+10.00%"
    assert snapshot.normalized["metrics"] == metrics


def test_question_time_windows_are_understood_in_both_languages():
    assert window_days("What did BBCA and BMRI ship in the last 30 days?") == 30
    assert window_days("apa yang dilakukan BBCA 14 hari terakhir") == 14
    assert window_days("anything new this week?") == 7
    assert window_days("BBRI lately") == 30
    assert window_days("Compare BBCA and BMRI financials") is None


def test_news_answers_the_asked_companies_not_our_own_perspective():
    from types import SimpleNamespace
    companies = [{"id": "a", "symbol": "BBCA", "name": "Bank Central Asia", "aliases": ["BCA"]},
                 {"id": "b", "symbol": "BMRI", "name": "Bank Mandiri", "aliases": ["Mandiri"]},
                 {"id": "c", "symbol": "BRIS", "name": "Bank Syariah Indonesia", "aliases": ["BSI"]}]
    run = SimpleNamespace(query="Our company is BRIS. Compare relative to our position. What did BBCA and BMRI ship?",
                          inputs={"companies": companies, "user_company": "BRIS", "compared_symbols": ["BBCA", "BMRI", "BRIS"]})
    question = asked_question(run)
    assert question == "What did BBCA and BMRI ship?"
    assert news_scope(run, question) == {"a", "b"}
    run.query = "What did BSI and BBCA launch?"
    assert news_scope(run, asked_question(run)) == {"a", "b", "c"}


def test_relevance_prefers_the_asked_company_and_topic_over_sector_roundups():
    catalogue = [{"symbol": "BBCA", "name": "Bank Central Asia", "aliases": ["BCA"]},
                 {"symbol": "BMRI", "name": "Bank Mandiri", "aliases": ["Mandiri"]},
                 {"symbol": "BBRI", "name": "Bank Rakyat Indonesia", "aliases": ["BRI"]}]
    company = catalogue[0]
    launch = {"company": company, "title": "BCA launches new mobile banking feature", "text": "BCA introduced..."}
    roundup = {"company": company, "title": "BCA, Mandiri and BRI shares rise", "text": "Big bank stocks..."}
    passing = {"company": company, "title": "Market wrap", "text": "Several lenders including BCA..."}
    topics = [("launch", "feature", "product")]
    assert relevance(launch, catalogue, topics) > relevance(passing, catalogue, topics) > relevance(roundup, catalogue, topics)


def test_context_titles_use_the_article_headline():
    company = {"symbol": "BBCA"}
    event = {"type": "Market context", "attribution_role": "unverified", "title": "EDGE secures credit facility from BCA", "text": "..."}
    assert title_for(event, company) == "BBCA · EDGE secures credit facility from BCA"


def test_commentary_titles_use_the_article_headline():
    event = {"type": "Analyst commentary", "attribution_role": "third_party_commentary",
             "title": "Analysts  see  Mandiri  dividend   holding", "text": "..."}
    assert title_for(event, {"symbol": "BMRI"}) == "BMRI · Analyst view: Analysts see Mandiri dividend holding"
