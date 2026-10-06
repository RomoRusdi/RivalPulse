import json

import httpx
import pytest

from app.agent import OllamaAdapter
from app.config import get_settings
from app.errors import ProviderError


def test_ollama_structured_output_uses_local_qwen(monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen3.8:27b")
    get_settings.cache_clear()

    def handler(request):
        payload = json.loads(request.content)
        assert request.url.path == "/api/chat"
        assert payload["model"] == "qwen3.8:27b"
        assert payload["stream"] is False
        assert payload["think"] is False
        assert payload["format"]["type"] == "object"
        assert payload["messages"][0]["role"] == "system"
        return httpx.Response(
            200,
            json={
                "message": {"content": '{"interpretations": []}'},
                "prompt_eval_count": 100,
                "eval_count": 20,
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    output = OllamaAdapter(client).structured(
        "analysis",
        {"type": "object"},
        {"candidates": []},
    )
    client.close()
    get_settings.cache_clear()
    assert output == {"interpretations": []}


def test_ollama_rejects_nonlocal_endpoint():
    with pytest.raises(ProviderError, match="local server"):
        OllamaAdapter._endpoint("https://external-llm.example.com")
