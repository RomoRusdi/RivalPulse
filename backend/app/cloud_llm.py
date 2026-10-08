"""Bounded cloud wording adapters. No provider-native tools or automatic retries.

Keys never enter payloads, model prompts, URLs, exceptions or saved run records.
All structured results go through the same agent/backend validators as Ollama.
"""
import copy
import json
from urllib.parse import quote

import httpx

from app.agent import LLMAdapter
from app.config import get_settings
from app.errors import AppError, ProviderError


def transport_schema(schema):
    """Portable grammar; stricter limits remain enforced by Pydantic/backend."""
    defs = schema.get("$defs", {})
    unsupported = {"$defs", "default", "title", "minimum", "maximum", "minItems", "maxItems", "minLength", "maxLength", "pattern", "format", "multipleOf"}
    def visit(node, depth=0):
        if depth > 30:
            raise ValueError("Schema nesting exceeds bound")
        if isinstance(node, list):
            return [visit(item, depth + 1) for item in node]
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            return visit(defs[node["$ref"].removeprefix("#/$defs/")], depth + 1)
        result = {k: visit(v, depth + 1) for k, v in node.items() if k not in unsupported}
        if result.get("type") == "object":
            result["additionalProperties"] = False
            result["required"] = list(result.get("properties", {}))
        pattern = node.get("pattern", "")
        if pattern.startswith("^(") and pattern.endswith(")$"):
            result["enum"] = pattern[2:-2].split("|")
        return result
    return visit(copy.deepcopy(schema))


# Listing is free on every provider, but the lists mix in embedding, image,
# audio and realtime models that cannot answer a structured chat request.
NOT_CHAT = ("embed", "tts", "whisper", "dall-e", "image", "imagen", "audio", "realtime", "transcribe",
            "moderation", "search", "instruct", "codex", "aqa", "veo", "live", "computer-use")
MODEL_LIMIT = 100


def available_models(provider, api_key=None, client=None):
    """Model IDs the credential can use: [(id, label)], provider order kept.

    One read-only request; nothing is generated or billed. The key travels only
    in a header and never appears in errors.
    """
    s = get_settings()
    headers = {}
    if provider == "ollama":
        url = s.ollama_base_url.rstrip("/") + "/api/tags"
    elif provider == "openai":
        url, headers = "https://api.openai.com/v1/models", {"Authorization": "Bearer " + api_key}
    elif provider == "anthropic":
        url = "https://api.anthropic.com/v1/models?limit=1000"
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    elif provider == "gemini":
        url, headers = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {"x-goog-api-key": api_key}
    else:
        raise ProviderError("LLM_NOT_CONFIGURED", "Unsupported model provider", False)
    owned = client is None
    client = client or httpx.Client(timeout=15, trust_env=False, follow_redirects=False)
    name = {"ollama": "The Ollama server", "openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Google"}[provider]
    try:
        response = client.get(url, headers=headers, timeout=15)
        if response.status_code in (401, 403):
            raise AppError("LLM_KEY_REJECTED", f"{name} rejected this API key. Check that it is correct and active.", 422)
        if response.status_code != 200 or len(response.content) > 2_000_000:
            raise ProviderError("LLM_UNAVAILABLE", f"{name} could not list models right now. Try again shortly.", True)
        data = response.json()
        if provider == "ollama":
            models = [(m["name"], m["name"]) for m in data.get("models", [])]
        elif provider == "openai":
            models = sorted(((m["id"], m["id"]) for m in data.get("data", [])
                             if m["id"].startswith(("gpt-", "chatgpt-", "o1", "o3", "o4"))), reverse=True)
        elif provider == "anthropic":
            models = [(m["id"], m.get("display_name") or m["id"]) for m in data.get("data", [])]
        else:
            models = [(m["name"].removeprefix("models/"), m.get("displayName") or m["name"].removeprefix("models/"))
                      for m in data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
            models.sort(key=lambda m: m[0], reverse=True)
    except httpx.HTTPError:
        unreachable = "isn't reachable from this server" if provider == "ollama" else "could not be reached"
        raise ProviderError("LLM_UNAVAILABLE", f"{name} {unreachable}.", True) from None
    except (KeyError, TypeError, AttributeError, ValueError):
        raise ProviderError("LLM_UNAVAILABLE", f"{name} returned a model list RivalPulse could not read.", False) from None
    finally:
        if owned:
            client.close()
    return [(model, label) for model, label in models if not any(word in model.lower() for word in NOT_CHAT)][:MODEL_LIMIT]


class CloudAdapter(LLMAdapter):
    def __init__(self, provider, model, api_key, client=None):
        if provider not in ("openai", "anthropic", "gemini"):
            raise ProviderError("LLM_NOT_CONFIGURED", "Unsupported model provider", False)
        self.provider, self.model = provider, model
        self._api_key = api_key
        self.client = client
        self.timeout_seconds = None

    def _request(self, messages, schema=None, max_tokens=400):
        timeout = min(self.timeout_seconds or get_settings().chat_timeout, get_settings().ollama_timeout)
        headers = {"Content-Type": "application/json"}
        if self.provider == "openai":
            url = "https://api.openai.com/v1/chat/completions"
            headers["Authorization"] = "Bearer " + self._api_key
            payload = {"model": self.model, "messages": messages, "max_completion_tokens": max_tokens, "store": False}
            if schema is not None:
                payload["response_format"] = {"type": "json_schema", "json_schema": {"name": "rivalpulse", "strict": True, "schema": transport_schema(schema)}}
        elif self.provider == "anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers.update({"x-api-key": self._api_key, "anthropic-version": "2023-06-01"})
            payload = {"model": self.model, "max_tokens": max_tokens,
                "system": "\n".join(m["content"] for m in messages if m["role"] == "system"),
                "messages": [m for m in messages if m["role"] != "system"]}
            if schema is not None:
                payload["output_config"] = {"format": {"type": "json_schema", "schema": transport_schema(schema)}}
        else:
            url = "https://generativelanguage.googleapis.com/v1beta/models/" + quote(self.model, safe="") + ":generateContent"
            headers["x-goog-api-key"] = self._api_key
            payload = {"systemInstruction": {"parts": [{"text": "\n".join(m["content"] for m in messages if m["role"] == "system")}]},
                "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"],
                "generationConfig": {"maxOutputTokens": max_tokens}}
            if self.model.startswith("gemini-2.5-flash"):
                payload["generationConfig"]["thinkingConfig"] = {"thinkingBudget": 0}
            if schema is not None:
                payload["generationConfig"].update(responseMimeType="application/json", responseJsonSchema=transport_schema(schema))
        owned = self.client is None
        client = self.client or httpx.Client(timeout=timeout, trust_env=False, follow_redirects=False)
        try:
            response = client.post(url, headers=headers, json=payload, timeout=timeout)
            if response.status_code != 200 or len(response.content) > 200_000:
                raise ProviderError("LLM_UNAVAILABLE", "The selected model could not answer; check its model ID, API key and provider allowance", False)
            data = response.json()
            if self.provider == "openai":
                choice = data["choices"][0]
                if choice.get("finish_reason") == "length":
                    raise ValueError("Structured response was truncated")
                if choice["message"].get("refusal"):
                    raise ProviderError("LLM_UNAVAILABLE", "The selected model declined this request", False)
                text = choice["message"]["content"]
            elif self.provider == "anthropic":
                if data.get("stop_reason") == "max_tokens":
                    raise ValueError("Structured response was truncated")
                text = "".join(block["text"] for block in data["content"] if block.get("type") == "text")
            else:
                candidate = data["candidates"][0]
                if candidate.get("finishReason") == "MAX_TOKENS":
                    raise ValueError("Structured response was truncated")
                text = "".join(part.get("text", "") for part in candidate["content"]["parts"] if not part.get("thought"))
            if not isinstance(text, str) or not text.strip():
                raise ProviderError("LLM_UNAVAILABLE", "The selected model returned no usable answer", False)
            return text
        except httpx.TimeoutException:
            raise ProviderError("LLM_ANALYSIS_TIMEOUT", "Selected model exceeded its response time allowance", False) from None
        except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError):
            raise ProviderError("LLM_UNAVAILABLE", "The selected model response was unavailable", False) from None
        finally:
            if owned:
                client.close()

    def structured(self, kind, schema, data, repair=False):
        from app.agent import OllamaAdapter
        messages = [{"role": "system", "content": OllamaAdapter.instructions(kind, repair)},
                    {"role": "user", "content": json.dumps({"task": kind, "data": data}, default=str)}]
        text = self._request(messages, schema, max_tokens=1024 if kind == "classify_events" else 2048)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            raise ValueError("The selected model returned invalid structured JSON") from None

    def chat(self, messages, max_tokens=400):
        return self._request(messages, max_tokens=max_tokens)[:2000]
