"""Unit tests for ai/dicta.

The real Dicta weights are never loaded here. We stub ``ModelRunner`` with a
simple object whose ``generate`` returns whatever canned string the test
queued up, then drive the FastAPI app via ``TestClient``.

The app's lifespan skips the real load when ``DICTA_SKIP_LOAD=1``, which we
set before importing the module.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make ``ai/dicta/app.py`` importable without packaging the repo.
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "ai" / "dicta"))

os.environ["DICTA_SKIP_LOAD"] = "1"

import app as dicta_app  # noqa: E402  (import after sys.path manipulation)


class StubRunner:
    """Drop-in replacement for :class:`ModelRunner`.

    Each call to ``generate`` pops the next queued response; tests that only
    need one response can set ``default`` instead of queuing.
    """

    def __init__(self, default: str = "") -> None:
        self.default = default
        self.queue: list[str] = []
        self.calls: list[dict] = []
        self.model_id = "stub-model"

    def queue_response(self, text: str) -> None:
        self.queue.append(text)

    def generate(self, prompt: str, **kwargs) -> str:
        self.calls.append({"prompt": prompt, **kwargs})
        if self.queue:
            return self.queue.pop(0)
        return self.default

    def count_tokens(self, text: str) -> int:
        # Deterministic token count — tests assert on it below.
        return max(1, len(text.split()))


@pytest.fixture
def client():
    """Yield a TestClient with a fresh StubRunner installed."""
    with TestClient(dicta_app.app) as c:
        runner = StubRunner()
        c.app.state.runner = runner
        c.app.state.ready = True
        c.runner = runner  # type: ignore[attr-defined]
        yield c


# ---------------------------------------------------------------------------
# /health
# ---------------------------------------------------------------------------


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["model"] == dicta_app.MODEL_ID


def test_health_503_when_not_ready(client):
    client.app.state.ready = False
    resp = client.get("/health")
    assert resp.status_code == 503
    assert resp.json()["ok"] is False


# ---------------------------------------------------------------------------
# /complete
# ---------------------------------------------------------------------------


def test_complete_happy(client):
    client.runner.default = "שלום עולם"  # type: ignore[attr-defined]
    resp = client.post(
        "/complete",
        json={"prompt": "היי", "max_tokens": 16, "temperature": 0.2},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["text"] == "שלום עולם"
    assert body["usage"]["prompt_tokens"] >= 1
    assert body["usage"]["completion_tokens"] >= 1
    # Params propagated to the runner.
    call = client.runner.calls[-1]  # type: ignore[attr-defined]
    assert call["max_tokens"] == 16
    assert call["temperature"] == 0.2


# ---------------------------------------------------------------------------
# /extract-lead — LEAD
# ---------------------------------------------------------------------------


def test_extract_lead_happy(client):
    payload = {
        "name": "דוד לוי",
        "phone": "0521234567",
        "email": None,
        "city": "תל אביב",
        "street": None,
        "interestType": "PRIVATE",
        "lookingFor": "BUY",
        "budget": 3000000,
        "rooms": "4",
        "notes": None,
        "description": "לקוח מחפש 4 חדרים בתל אביב",
    }
    client.runner.queue_response(json.dumps(payload, ensure_ascii=False))  # type: ignore[attr-defined]

    resp = client.post(
        "/extract-lead",
        json={"transcript": "היי, דוד לוי, מחפש דירה", "kind": "LEAD"},
    )
    assert resp.status_code == 200
    assert resp.json() == payload


# ---------------------------------------------------------------------------
# /extract-lead — PROPERTY
# ---------------------------------------------------------------------------


def test_extract_property_happy(client):
    payload = {
        "owner": "רונית כהן",
        "ownerPhone": "0549998877",
        "assetClass": "RESIDENTIAL",
        "category": "SALE",
        "type": "דירה",
        "city": "תל אביב",
        "street": "דיזנגוף 100",
        "marketingPrice": 4200000,
        "sqm": 120,
        "rooms": 5,
        "floor": 4,
        "notes": None,
    }
    # Model likes to prefix "פלט:" and wrap in code fences — make sure the
    # JSON extractor still pulls the object out.
    noisy = "פלט:\n```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```"
    client.runner.queue_response(noisy)  # type: ignore[attr-defined]

    resp = client.post(
        "/extract-lead",
        json={"transcript": "דירה של רונית כהן", "kind": "PROPERTY"},
    )
    assert resp.status_code == 200
    assert resp.json() == payload


# ---------------------------------------------------------------------------
# /extract-lead — 422 on invalid JSON after retry
# ---------------------------------------------------------------------------


def test_extract_lead_422_on_garbage(client):
    # Both passes return non-JSON — the handler must surface 422 and the raw
    # text so the orchestrator can log / fall back.
    client.runner.queue_response("זה לא JSON בכלל")  # type: ignore[attr-defined]
    client.runner.queue_response("עדיין לא JSON")  # type: ignore[attr-defined]

    resp = client.post(
        "/extract-lead",
        json={"transcript": "משהו", "kind": "LEAD"},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["error"] == "invalid_json"
    assert "raw" in detail


def test_extract_lead_422_when_missing_required(client):
    # Valid JSON but missing the required ``name`` — should 422 with
    # ``missing_required`` so the caller knows it's a schema issue, not a
    # parser one.
    client.runner.queue_response(json.dumps({"phone": "0501111111"}))  # type: ignore[attr-defined]
    resp = client.post(
        "/extract-lead",
        json={"transcript": "שיחה", "kind": "LEAD"},
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "missing_required"


# ---------------------------------------------------------------------------
# JSON extraction helper — pure function, worth covering directly.
# ---------------------------------------------------------------------------


def test_extract_json_handles_fenced_and_prefixed():
    raw = 'פלט:\n```json\n{"a": 1, "b": "ב"}\n```\nסוף.'
    assert dicta_app.extract_json(raw) == {"a": 1, "b": "ב"}


def test_extract_json_returns_none_on_garbage():
    assert dicta_app.extract_json("כלום כאן") is None
    assert dicta_app.extract_json("") is None
