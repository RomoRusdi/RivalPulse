"""Conversation must never cost credits, and a rejected AI sentence must never
discard evidence that was already collected."""
from sqlalchemy import func, select

from app.agent import LLMAdapter, is_financial_question
from app.chat import language
from app.db import session
from app.errors import ProviderError
from app.models import CreditAccount, Run
from app.research import execute_run
from tests.conftest import launch


class Talker(LLMAdapter):
    def __init__(self, text="Doing well, thanks! Want me to check on your competitors?"):
        self.text, self.seen = text, None

    def chat(self, messages, max_tokens=400):
        self.seen = messages
        return self.text


def runs_and_credits():
    with session() as db:
        return db.scalar(select(func.count()).select_from(Run)), db.get(CreditAccount, "sectors").used


def test_small_talk_never_creates_a_run_or_spends_credits(client):
    before = runs_and_credits()
    for message in ("how is your day", "apa kabar?", "what is RivalPulse?"):
        response = client.post("/api/v1/chat", json={"message": message})
        assert response.status_code == 200, response.text
        assert response.json()["reply"]
    assert runs_and_credits() == before


def test_fallback_reply_follows_the_users_language(client):
    english = client.post("/api/v1/chat", json={"message": "how are you today"}).json()
    indonesian = client.post("/api/v1/chat", json={"message": "halo, apa kabar kamu hari ini?"}).json()
    assert english["source"] == "fallback" and english["language"] == "en"
    assert indonesian["language"] == "id" and "Saya" in indonesian["reply"]


def test_model_reply_gets_workspace_context_and_history(client, monkeypatch):
    talker = Talker()
    monkeypatch.setattr("app.agent.OllamaAdapter", lambda: talker)
    monkeypatch.setenv("LLM_ENABLED", "true")
    from app.config import get_settings
    get_settings.cache_clear()

    body = {"message": "how is your day", "history": [{"role": "user", "content": "hello"},
                                                      {"role": "assistant", "content": "Hi there"}]}
    reply = client.post("/api/v1/chat", json=body).json()

    assert reply == {"reply": talker.text, "source": "llm", "language": "en"}
    system, *turns = talker.seen
    assert "TLKM" in system["content"], "the model should know which competitors are tracked"
    assert [t["content"] for t in turns] == ["hello", "Hi there", "how is your day"]


def test_figures_from_model_memory_are_suppressed(client, monkeypatch):
    monkeypatch.setattr("app.agent.OllamaAdapter", lambda: Talker("BCA earned Rp 54 triliun last year."))
    monkeypatch.setenv("LLM_ENABLED", "true")
    from app.config import get_settings
    get_settings.cache_clear()

    reply = client.post("/api/v1/chat", json={"message": "tell me something fun"}).json()
    assert reply["source"] == "guarded"
    assert "54" not in reply["reply"]


def test_rejected_ai_wording_still_publishes_the_cited_findings(client, watchlist):
    class NumericWording(LLMAdapter):
        def structured(self, kind, schema, data, repair=False):
            return {"interpretations": [{"event_key": c["event_key"],
                                         "supporting_claim_ids": [c["claims"][0]["claim_id"]],
                                         "why_it_matters": f"{c['company']['symbol']} has a potentially relevant announcement for the investigation objective.",
                                         "potential_implication": "Revenue will rise 40% next year.",
                                         "uncertainty": "high",
                                         "recommended_next_step": "Compare the advertised offer with a relevant existing product after confirming overlap.",
                                         "limitations": ["The announcement does not establish customer uptake."]}
                                        for c in data["candidates"]]}

    run_id = launch(client, watchlist)
    execute_run(run_id, NumericWording())
    detail = client.get("/api/v1/research-runs/" + run_id).json()

    assert detail["status"] == "completed", detail["error_code"]
    assert len(detail["result"]["signals"]) == 3
    analyze = next(s for s in detail["progress"] if s["stage"] == "analyze")
    assert analyze["details"]["interpreter"] == "validated_fallback"
    assert all("40" not in card["hypotheses"][0]["text"] for card in detail["result"]["signals"])
    payload = client.get("/runs/" + run_id + "/stream").text
    assert '"interpreter": "validated_fallback"' in payload


def test_model_outage_keeps_evidence_with_explicit_unavailable_support(client, watchlist):
    class Down(LLMAdapter):
        def structured(self, *args, **kwargs):
            raise ProviderError("LLM_UNAVAILABLE", "down")

    run_id = launch(client, watchlist)
    execute_run(run_id, Down())
    detail = client.get("/api/v1/research-runs/" + run_id).json()
    assert detail["status"] == "completed"
    assert detail["result"]["signals"]
    assert all(card["decision_support"]["fallback_reason"] == "model_unavailable" for card in detail["result"]["signals"])
    assert all(card["decision_support"]["origin"] == "rule_based" for card in detail["result"]["signals"])


def test_saved_summary_is_cited_read_only_and_does_not_call_the_model(client, watchlist, monkeypatch):
    from sqlalchemy import func, select
    from app.db import session
    from app.models import Run, Snapshot
    from tests.conftest import execute
    execute(client, watchlist)
    def forbidden(*args, **kwargs):
        raise AssertionError("Saved summary must not call the model")
    monkeypatch.setattr("app.agent.OllamaAdapter.chat", forbidden)
    with session() as db:
        before = (db.scalar(select(func.count()).select_from(Run)), db.scalar(select(func.count()).select_from(Snapshot)))
    response = client.post("/api/v1/chat", json={"message": "Summarize the stored findings for EXCL, TLKM and ISAT. Include the news too."})
    assert response.status_code == 200
    result = response.json()
    assert result["source"] == "saved_evidence"
    assert "Evidence: /signals/" in result["reply"] and "no new news collection" in result["reply"]
    with session() as db:
        assert before == (db.scalar(select(func.count()).select_from(Run)), db.scalar(select(func.count()).select_from(Snapshot)))


def test_language_detection():
    assert language("how is your day") == "en"
    assert language("apa kabar hari ini?") == "id"
    assert language("tolong bantu saya") == "id"


def test_financial_route_understands_indonesian():
    assert is_financial_question("bandingkan pendapatan dan laba BBRI")
    assert is_financial_question("Compare revenue and earnings")
    assert not is_financial_question("bandingkan harga paket terbaru")
    assert not is_financial_question("pendapatan dan kampanye minggu ini")


def test_finance_concept_questions_reach_the_model_and_off_topic_does_not(client, monkeypatch):
    talker = Talker("NIM compares what a bank earns on loans with what it pays on deposits.")
    monkeypatch.setattr("app.agent.OllamaAdapter", lambda: talker)
    monkeypatch.setenv("LLM_ENABLED", "true")
    from app.config import get_settings
    get_settings.cache_clear()
    for message in ("What is NIM?", "What does CASA mean?", "How do dividends work?", "Apa itu IHSG?", "What is an IPO?"):
        assert client.post("/api/v1/chat", json={"message": message}).json()["source"] == "llm", message
    for message in ("Who is the president of Indonesia?", "Write me a poem"):
        assert client.post("/api/v1/chat", json={"message": message}).json()["source"] == "guarded", message


def test_credit_questions_are_answered_exactly_without_the_model(client, monkeypatch):
    def no_model():
        raise AssertionError("credits must not need a model")
    monkeypatch.setattr("app.agent.OllamaAdapter", no_model)
    before = runs_and_credits()
    english = client.post("/api/v1/chat", json={"message": "How many credits do I have left?"}).json()
    indonesian = client.post("/api/v1/chat", json={"message": "Berapa sisa kredit saya?"}).json()
    assert english["source"] == indonesian["source"] == "workspace"
    assert "research credits available" in english["reply"] and indonesian["language"] == "id"
    assert runs_and_credits() == before


def test_saved_flag_answers_from_stored_findings_names_gaps_and_never_spends(client, watchlist, monkeypatch):
    execute_run(launch(client, watchlist))
    def no_model():
        raise AssertionError("a stored summary must not call the model")
    monkeypatch.setattr("app.agent.OllamaAdapter", no_model)
    before = runs_and_credits()
    body = {"message": "Summarize my competitors", "saved": True, "symbols": []}
    reply = client.post("/api/v1/chat", json=body).json()
    assert reply["source"] == "saved_evidence" and "no new news collection" in reply["reply"]
    assert "Evidence: /signals/" in reply["reply"]
    # A company with nothing stored is called out instead of silently skipped.
    gap = client.post("/api/v1/chat", json={"message": "What do we know about Mandiri?", "saved": True, "symbols": ["BMRI"]}).json()
    assert gap["source"] == "saved_evidence" and "No saved findings yet for BMRI" in gap["reply"]
    # Without the flag, recall wording is still recognised; fresh wording is not stored-only.
    assert client.post("/api/v1/chat", json={"message": "What did we find last time about TLKM?"}).json()["source"] == "saved_evidence"
    assert runs_and_credits() == before
