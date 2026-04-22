"""
Integration-style tests for the AI orchestrator's /process pipeline.

We mock all three upstream services (whisper, dicta, estia) with respx
so the tests run without any containers. The pipeline code is exercised
end-to-end — FastAPI app, multipart parsing, httpx outbound calls.
"""

from __future__ import annotations

import io
import os
import sys
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

# Ensure the ai/agent module is importable when running pytest from the
# repo root. The container at runtime uses WORKDIR=/app which flattens
# this, but tests run from the monorepo root.
AGENT_DIR = Path(__file__).resolve().parents[3] / "ai" / "agent"
sys.path.insert(0, str(AGENT_DIR))

# Set env vars BEFORE importing app so the module-level config picks
# them up. These are the URLs respx will match against.
os.environ["WHISPER_URL"] = "http://test-whisper:8080"
os.environ["DICTA_URL"] = "http://test-dicta:8080"
os.environ["ESTIA_API_URL"] = "http://test-estia:4000"
os.environ["ESTIA_SERVICE_TOKEN"] = "test-service-token"

import app as agent_app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(agent_app.app)


def _audio_bytes() -> bytes:
    # Tiny fake audio payload. Whisper is mocked so the bytes are never
    # actually transcribed — we just need the multipart field to parse.
    return b"RIFFfakewavefakedata"


# ── Happy path ─────────────────────────────────────────────────────────


@respx.mock
def test_process_happy_path_lead(client: TestClient) -> None:
    whisper = respx.post("http://test-whisper:8080/transcribe").mock(
        return_value=httpx.Response(200, json={"text": "לקוח חדש בתל אביב"})
    )
    dicta = respx.post("http://test-dicta:8080/extract-lead").mock(
        return_value=httpx.Response(
            200,
            json={
                "name": "דן לוי",
                "phone": "050-1111111",
                "interestType": "PRIVATE",
                "lookingFor": "BUY",
                "city": "תל אביב",
            },
        )
    )
    estia = respx.post("http://test-estia:4000/api/leads").mock(
        return_value=httpx.Response(
            200, json={"lead": {"id": "lead-abc", "name": "דן לוי"}}
        )
    )

    res = client.post(
        "/process?kind=LEAD",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["mode"] == "created"
    assert body["transcript"] == "לקוח חדש בתל אביב"
    assert body["created"]["id"] == "lead-abc"
    assert body["extracted"]["city"] == "תל אביב"
    # The backend call must include the service token AND the forwarded
    # actor id — this is the mechanism that lets the backend insert rows
    # owned by the requesting agent while still authenticating us.
    assert whisper.called and dicta.called and estia.called
    estia_req = estia.calls.last.request
    assert estia_req.headers.get("authorization") == "Bearer test-service-token"
    assert estia_req.headers.get("x-agent-actor-id") == "user-42"


@respx.mock
def test_process_happy_path_property(client: TestClient) -> None:
    respx.post("http://test-whisper:8080/transcribe").mock(
        return_value=httpx.Response(200, json={"text": "דירת 4 חדרים"})
    )
    respx.post("http://test-dicta:8080/extract-lead").mock(
        return_value=httpx.Response(
            200,
            json={"street": "רחוב הרצל 10", "city": "חיפה", "rooms": 4},
        )
    )
    property_route = respx.post("http://test-estia:4000/api/properties").mock(
        return_value=httpx.Response(
            200, json={"property": {"id": "prop-xyz", "city": "חיפה"}}
        )
    )

    res = client.post(
        "/process?kind=PROPERTY",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 200
    assert res.json()["created"]["id"] == "prop-xyz"
    assert property_route.called


# ── Draft mode (estia 400) ──────────────────────────────────────────────


@respx.mock
def test_process_draft_mode_on_estia_400(client: TestClient) -> None:
    respx.post("http://test-whisper:8080/transcribe").mock(
        return_value=httpx.Response(200, json={"text": "שיחה קצרה"})
    )
    respx.post("http://test-dicta:8080/extract-lead").mock(
        return_value=httpx.Response(
            200, json={"name": "דן"}  # no phone → backend will 400
        )
    )
    respx.post("http://test-estia:4000/api/leads").mock(
        return_value=httpx.Response(
            400,
            json={
                "error": {"message": "Invalid request body", "code": "invalid_request"}
            },
        )
    )

    res = client.post(
        "/process",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["mode"] == "draft"
    assert body["created"] is None
    # The extracted payload is still returned so the UI can pre-fill.
    assert body["extracted"] == {"name": "דן"}


# ── Upstream failures ───────────────────────────────────────────────────


@respx.mock
def test_process_whisper_5xx_raises_502(client: TestClient) -> None:
    respx.post("http://test-whisper:8080/transcribe").mock(
        return_value=httpx.Response(503, json={"error": "overloaded"})
    )

    res = client.post(
        "/process",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 502


@respx.mock
def test_process_dicta_5xx_raises_502(client: TestClient) -> None:
    respx.post("http://test-whisper:8080/transcribe").mock(
        return_value=httpx.Response(200, json={"text": "שלום"})
    )
    respx.post("http://test-dicta:8080/extract-lead").mock(
        return_value=httpx.Response(500, json={"error": "model crashed"})
    )

    res = client.post(
        "/process",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 502


@respx.mock
def test_process_estia_5xx_raises_502(client: TestClient) -> None:
    respx.post("http://test-whisper:8080/transcribe").mock(
        return_value=httpx.Response(200, json={"text": "שלום"})
    )
    respx.post("http://test-dicta:8080/extract-lead").mock(
        return_value=httpx.Response(200, json={"name": "דן", "phone": "050"})
    )
    respx.post("http://test-estia:4000/api/leads").mock(
        return_value=httpx.Response(500, json={"error": "db down"})
    )

    res = client.post(
        "/process",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 502


# ── Validation / guard rails ───────────────────────────────────────────


def test_process_rejects_missing_actor_header(client: TestClient) -> None:
    res = client.post(
        "/process",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
    )
    assert res.status_code == 400


def test_process_rejects_unknown_kind(client: TestClient) -> None:
    res = client.post(
        "/process?kind=BOGUS",
        files={"audio": ("r.webm", _audio_bytes(), "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 400


def test_process_rejects_empty_audio(client: TestClient) -> None:
    res = client.post(
        "/process",
        files={"audio": ("r.webm", b"", "audio/webm")},
        headers={"X-Agent-Actor-Id": "user-42"},
    )
    assert res.status_code == 400


# ── Health ─────────────────────────────────────────────────────────────


@respx.mock
def test_health_ok_when_upstreams_ok(client: TestClient) -> None:
    respx.get("http://test-whisper:8080/health").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )
    respx.get("http://test-dicta:8080/health").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )

    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


@respx.mock
def test_health_503_when_whisper_down(client: TestClient) -> None:
    respx.get("http://test-whisper:8080/health").mock(
        return_value=httpx.Response(503)
    )
    respx.get("http://test-dicta:8080/health").mock(
        return_value=httpx.Response(200, json={"ok": True})
    )

    res = client.get("/health")
    assert res.status_code == 503


# ── Allowlist guard ────────────────────────────────────────────────────


def test_outbound_allowlist_blocks_other_hosts() -> None:
    """The event-hook guard refuses requests not in the allowlist. Tests the
    belt-and-braces layer underneath docker-compose network isolation."""
    import asyncio

    async def run() -> None:
        req = httpx.Request("POST", "http://evil.example.com/steal")
        with pytest.raises(RuntimeError, match="outbound host not in allowlist"):
            await agent_app._assert_outbound_allowed(req)

    asyncio.run(run())


def test_outbound_allowlist_allows_configured_hosts() -> None:
    import asyncio

    async def run() -> None:
        for url in (
            "http://test-whisper:8080/x",
            "http://test-dicta:8080/x",
            "http://test-estia:4000/x",
        ):
            req = httpx.Request("POST", url)
            # Should not raise.
            await agent_app._assert_outbound_allowed(req)

    asyncio.run(run())
