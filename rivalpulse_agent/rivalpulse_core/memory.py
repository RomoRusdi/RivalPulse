"""Small durable research memory for state-aware competitive signals."""

from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Any

from .schemas import ChangeStatus, ResearchResult


class ResearchMemory:
    """Persist only comparison fingerprints, never provider credentials or raw payloads.

    The store is deliberately replaceable: the CLI can use this JSON implementation,
    while the backend can implement the same boundary with PostgreSQL. Writes are
    atomic and a process-local lock prevents concurrent requests from corrupting it.
    """

    _lock = threading.Lock()

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def compare_and_store(self, result: ResearchResult) -> ResearchResult:
        with self._lock:
            document = self._load()
            scope_key = self._scope_key(result)
            previous = document.get("scopes", {}).get(scope_key)
            previous_signals = (previous or {}).get("signals", {})

            statuses: dict[str, ChangeStatus] = {}
            stored_signals: dict[str, dict[str, str]] = {}
            for signal in result.signals:
                fingerprint = self._signal_fingerprint(result, signal.evidence_ids, signal.stable_key)
                prior = previous_signals.get(signal.stable_key)
                if previous is None:
                    status = ChangeStatus.BASELINE
                elif prior is None:
                    status = ChangeStatus.NEW
                elif prior.get("fingerprint") == fingerprint:
                    status = ChangeStatus.UNCHANGED
                else:
                    status = ChangeStatus.UPDATED
                statuses[signal.stable_key] = status
                stored_signals[signal.stable_key] = {
                    "fingerprint": fingerprint,
                    "signal_id": signal.id,
                }

            compared = result.model_copy(
                update={
                    "compared_against_run_id": (previous or {}).get("run_id"),
                    "signals": [
                        signal.model_copy(update={"change_status": statuses[signal.stable_key]})
                        for signal in result.signals
                    ],
                }
            )
            compared = compared.model_copy(update={"summary": self._summary(compared)})

            document.setdefault("schema_version", 1)
            scopes = document.setdefault("scopes", {})
            scopes[scope_key] = {
                "run_id": result.run_id,
                "generated_at": result.generated_at.isoformat(),
                "signals": stored_signals,
            }
            self._write(document)
            return compared

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"schema_version": 1, "scopes": {}}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Research memory is unreadable: {self.path}") from exc
        if not isinstance(data, dict) or data.get("schema_version") != 1:
            raise RuntimeError(f"Unsupported research memory format: {self.path}")
        return data

    def _write(self, document: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(
            json.dumps(document, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, self.path)

    @staticmethod
    def _scope_key(result: ResearchResult) -> str:
        scope = "|".join([result.target_company, *sorted(result.competitors)])
        return hashlib.sha256(scope.encode("utf-8")).hexdigest()

    @staticmethod
    def _signal_fingerprint(
        result: ResearchResult,
        evidence_ids: list[str],
        stable_key: str,
    ) -> str:
        evidence = {item.id: item for item in result.evidence}
        payload = [
            {
                "statement": evidence[item].statement,
                "value": evidence[item].value,
                "period": evidence[item].period,
                "source_refs": evidence[item].source_refs,
            }
            for item in evidence_ids
            if item in evidence
        ]
        encoded = json.dumps(
            {"stable_key": stable_key, "evidence": payload},
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _summary(result: ResearchResult) -> str:
        counts = {
            status: sum(signal.change_status is status for signal in result.signals)
            for status in ChangeStatus
        }
        prefix = (
            "Baseline established"
            if result.compared_against_run_id is None
            else (
                f"Since the previous run: {counts[ChangeStatus.NEW]} new, "
                f"{counts[ChangeStatus.UPDATED]} updated, and "
                f"{counts[ChangeStatus.UNCHANGED]} unchanged signals."
            )
        )
        return f"{prefix} {result.summary}"
