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
    monkeypatch.setattr("app.chat.OllamaAdapter", lambda: talker)
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
    monkeypatch.setattr("app.chat.OllamaAdapter", lambda: Talker("BCA earned Rp 54 triliun last year."))
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
                                         "hypothesis": "Revenue will rise 40% next year.",
                                         "uncertainty": "low",
                                         "marketing_implication": "Expect 40% growth."}
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


def test_model_outage_during_analysis_still_fails_explicitly(client, watchlist):
    class Down(LLMAdapter):
        def structured(self, *args, **kwargs):
            raise ProviderError("LLM_UNAVAILABLE", "down")

    run_id = launch(client, watchlist)
    execute_run(run_id, Down())
    assert client.get("/api/v1/research-runs/" + run_id).json()["error_code"] == "LLM_UNAVAILABLE"


def test_language_detection():
    assert language("how is your day") == "en"
    assert language("apa kabar hari ini?") == "id"
    assert language("tolong bantu saya") == "id"


def test_financial_route_understands_indonesian():
    assert is_financial_question("bandingkan pendapatan dan laba BBRI")
    assert is_financial_question("Compare revenue and earnings")
    assert not is_financial_question("bandingkan harga paket terbaru")
    assert not is_financial_question("pendapatan dan kampanye minggu ini")
