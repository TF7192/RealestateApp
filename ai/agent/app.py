"""
Estia AI orchestrator container.

Pipeline
--------
1. Receive multipart audio from the Estia backend at POST /process.
2. Forward audio to the in-network Whisper service → plain-text transcript.
3. Forward transcript to the in-network Dicta service → structured JSON
   (lead or property, depending on ?kind=).
4. POST the structured JSON to the Estia backend. On 400 from Estia
   (validation-missing-required-field), return draft mode so the
   frontend can render a pre-filled form for the agent to complete.

Security
--------
The container has a strict outbound URL allowlist — requests may only go
to the three services below. Docker-compose network isolation enforces
this at the network layer; we add a belt-and-braces guard inside the
httpx.AsyncClient event_hooks so a code-level mistake can't exfiltrate.

Environment
-----------
WHISPER_URL            e.g. http://estia-ai-whisper:8080
DICTA_URL              e.g. http://estia-ai-dicta:8080
ESTIA_API_URL          e.g. http://estia-backend:4000
ESTIA_SERVICE_TOKEN    shared secret matching the backend env var
PORT                   default 8080
"""

from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import (
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import JSONResponse

logger = logging.getLogger("estia.ai.agent")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# ── Config ──────────────────────────────────────────────────────────────
WHISPER_URL = os.environ.get("WHISPER_URL", "http://estia-ai-whisper:8080").rstrip("/")
DICTA_URL = os.environ.get("DICTA_URL", "http://estia-ai-dicta:8080").rstrip("/")
ESTIA_API_URL = os.environ.get("ESTIA_API_URL", "http://estia-backend:4000").rstrip("/")
ESTIA_SERVICE_TOKEN = os.environ.get("ESTIA_SERVICE_TOKEN", "")

# Timeouts (seconds). Whisper is slow (audio → text); Dicta is CPU-bound
# but bounded by token count; the Estia backend is just a DB insert so
# 10s is generous.
WHISPER_TIMEOUT = 60.0
DICTA_TIMEOUT = 30.0
ESTIA_TIMEOUT = 10.0

# Allowlist of outbound hostnames. Docker network isolation should make
# this impossible to bypass, but we enforce at the HTTP layer too so a
# code-level bug can't accidentally reach out to the public internet.
ALLOWED_HOSTS = {
    urlparse(WHISPER_URL).hostname,
    urlparse(DICTA_URL).hostname,
    urlparse(ESTIA_API_URL).hostname,
}


async def _assert_outbound_allowed(request: httpx.Request) -> None:
    """httpx event hook — blocks any request not in the allowlist."""
    host = request.url.host
    if host not in ALLOWED_HOSTS:
        raise RuntimeError(
            f"outbound host not in allowlist: {host!r} (allowed: {sorted(h for h in ALLOWED_HOSTS if h)})"
        )


def make_client(timeout: float) -> httpx.AsyncClient:
    """Build an httpx.AsyncClient with the outbound allowlist guard wired in."""
    return httpx.AsyncClient(
        timeout=timeout,
        event_hooks={"request": [_assert_outbound_allowed]},
    )


# ── App ─────────────────────────────────────────────────────────────────
app = FastAPI(title="estia-ai-agent", version="0.1.0")


@app.get("/health")
async def health() -> JSONResponse:
    """Returns 200 when both whisper and dicta answer their own /health.
    Returns 503 if either is unreachable — kubernetes / compose-healthcheck
    uses this to gate traffic."""
    async with make_client(timeout=5.0) as client:
        try:
            w = await client.get(f"{WHISPER_URL}/health")
            d = await client.get(f"{DICTA_URL}/health")
        except httpx.HTTPError as e:
            logger.warning("health check upstream error: %s", e)
            return JSONResponse({"ok": False, "error": str(e)}, status_code=503)
        if w.status_code != 200 or d.status_code != 200:
            return JSONResponse(
                {"ok": False, "whisper": w.status_code, "dicta": d.status_code},
                status_code=503,
            )
    return JSONResponse({"ok": True})


async def _transcribe(client: httpx.AsyncClient, audio_bytes: bytes, filename: str, content_type: str) -> str:
    """Step 1 — audio → transcript (Hebrew text)."""
    files = {"audio": (filename, audio_bytes, content_type or "application/octet-stream")}
    r = await client.post(f"{WHISPER_URL}/transcribe", files=files, timeout=WHISPER_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    text = data.get("text", "")
    if not isinstance(text, str):
        raise RuntimeError(f"whisper returned non-string text: {type(text).__name__}")
    return text


async def _extract(client: httpx.AsyncClient, transcript: str, kind: str) -> dict[str, Any]:
    """Step 2 — transcript → structured JSON (lead/property fields)."""
    payload = {"text": transcript, "kind": kind}
    r = await client.post(f"{DICTA_URL}/extract-lead", json=payload, timeout=DICTA_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, dict):
        raise RuntimeError(f"dicta returned non-object payload: {type(data).__name__}")
    return data


async def _create_entity(
    client: httpx.AsyncClient,
    extracted: dict[str, Any],
    kind: str,
    actor_id: str,
) -> tuple[str, dict[str, Any] | None]:
    """Step 3 — POST the extracted JSON to Estia.

    Returns ("created", <entity>) on 2xx, ("draft", None) on 400 (the
    extraction was missing a required field and the UI needs to let the
    agent fill gaps). Any other upstream failure raises to the caller,
    which converts it to a 502.
    """
    path = "/api/leads" if kind == "LEAD" else "/api/properties"
    headers = {
        "Authorization": f"Bearer {ESTIA_SERVICE_TOKEN}",
        "X-Agent-Actor-Id": actor_id,
        "Content-Type": "application/json",
    }
    r = await client.post(
        f"{ESTIA_API_URL}{path}",
        json=extracted,
        headers=headers,
        timeout=ESTIA_TIMEOUT,
    )
    if r.status_code == 400:
        # Validation failed — extraction was incomplete. Fall back to
        # draft mode so the frontend can pre-fill + ask the agent to
        # complete the missing fields manually.
        logger.info("estia validation 400 — returning draft mode")
        return "draft", None
    r.raise_for_status()
    body = r.json()
    # Both /api/leads and /api/properties wrap the row in a single key.
    entity = body.get("lead") or body.get("property") or body
    return "created", entity


@app.post("/process")
async def process(
    audio: UploadFile = File(...),
    kind: str = Query("LEAD"),
    x_agent_actor_id: str | None = Header(default=None, alias="X-Agent-Actor-Id"),
) -> JSONResponse:
    """End-to-end pipeline — see module docstring."""
    kind = (kind or "LEAD").upper()
    if kind not in ("LEAD", "PROPERTY"):
        raise HTTPException(status_code=400, detail="kind must be LEAD or PROPERTY")
    if not x_agent_actor_id:
        raise HTTPException(status_code=400, detail="missing X-Agent-Actor-Id header")
    if not ESTIA_SERVICE_TOKEN:
        # Misconfiguration — don't forward a call we can't authenticate.
        raise HTTPException(status_code=500, detail="ESTIA_SERVICE_TOKEN not configured")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty audio")

    try:
        async with make_client(timeout=WHISPER_TIMEOUT) as client:
            transcript = await _transcribe(
                client,
                audio_bytes,
                filename=audio.filename or "audio.webm",
                content_type=audio.content_type or "application/octet-stream",
            )
            extracted = await _extract(client, transcript, kind)
            mode, entity = await _create_entity(client, extracted, kind, x_agent_actor_id)
    except httpx.HTTPStatusError as e:
        logger.exception("upstream HTTP error: %s %s", e.response.status_code, e.request.url)
        raise HTTPException(status_code=502, detail=f"upstream {e.response.status_code}")
    except httpx.HTTPError as e:
        logger.exception("upstream error")
        raise HTTPException(status_code=502, detail=f"upstream error: {e}")

    return JSONResponse(
        {
            "transcript": transcript,
            "extracted": extracted,
            "created": entity,
            "mode": mode,
        }
    )
