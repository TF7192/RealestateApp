"""DictaLM Hebrew LLM inference service.

Wraps a Dicta-IL instruct model (default: ``dicta-il/dictalm2.0-instruct``;
override via the ``MODEL_ID`` env var) behind a small FastAPI surface so the
Estia voice-to-lead orchestrator can call it at
``http://estia-ai-dicta:8080`` without needing to know Hugging Face plumbing.

Three endpoints:

* ``GET  /health``        — liveness + which model is loaded.
* ``POST /complete``      — raw completion, pass-through params.
* ``POST /extract-lead``  — Hebrew-transcript-to-JSON for the LEAD /
  PROPERTY schemas the backend expects. Prompt-engineered here so all the
  few-shot examples live in one place.

The heavy lifting happens in :class:`ModelRunner`. In production this holds a
``transformers`` pipeline; in tests it's monkey-patched with a stub that
returns a canned JSON string — the tests never touch the real weights.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s rid=%(request_id)s %(message)s",
)


class _RequestIdFilter(logging.Filter):
    """Ensure every log record has a ``request_id`` attribute.

    FastAPI middleware sets one per request; background / startup logs get a
    static ``"-"`` so the format string below never crashes.
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return True


for _h in logging.getLogger().handlers:
    _h.addFilter(_RequestIdFilter())

logger = logging.getLogger("dicta")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Default to the 2.0 flagship. When/if Dicta publishes a 3.0 instruct
# checkpoint on HF, operators can flip ``MODEL_ID`` without a rebuild.
DEFAULT_MODEL_ID = "dicta-il/dictalm2.0-instruct"
MODEL_ID = os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)
MODEL_CACHE = os.environ.get("HF_HOME", "/models")
MAX_NEW_TOKENS_CAP = int(os.environ.get("MAX_NEW_TOKENS_CAP", "1024"))

# ---------------------------------------------------------------------------
# Model runner
# ---------------------------------------------------------------------------


class ModelRunner:
    """Thin wrapper around a causal-LM pipeline.

    Exists so tests can swap in a stub by assigning ``app.state.runner`` to
    anything with a ``generate(prompt, **kwargs) -> str`` method.
    """

    def __init__(self, model_id: str) -> None:
        self.model_id = model_id
        self._tokenizer = None
        self._model = None
        self._device = "cpu"

    def load(self) -> None:
        """Load weights. Called from FastAPI lifespan; slow (minutes on CPU)."""
        import torch  # local import keeps test stubs from needing torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        use_gpu = torch.cuda.is_available()
        self._device = "cuda" if use_gpu else "cpu"
        dtype = torch.float16 if use_gpu else torch.float32

        logger.info("loading model %s on %s dtype=%s", self.model_id, self._device, dtype)
        self._tokenizer = AutoTokenizer.from_pretrained(
            self.model_id, cache_dir=MODEL_CACHE
        )
        self._model = AutoModelForCausalLM.from_pretrained(
            self.model_id,
            cache_dir=MODEL_CACHE,
            torch_dtype=dtype,
            device_map="auto" if use_gpu else None,
            low_cpu_mem_usage=True,
        )
        if not use_gpu:
            self._model.to("cpu")

        # Warmup: a single short pass so the first real request doesn't pay the
        # compile / kernel-selection tax. Errors here are non-fatal — we'd
        # rather serve 503 through /health than block the container.
        try:
            self.generate("שלום", max_tokens=4, temperature=0.0)
            logger.info("warmup complete")
        except Exception as exc:  # pragma: no cover — warmup is best-effort
            logger.warning("warmup failed: %s", exc)

    def generate(
        self,
        prompt: str,
        *,
        max_tokens: int = 512,
        temperature: float = 0.2,
        top_p: float = 0.9,
        repetition_penalty: float = 1.1,
    ) -> str:
        if self._model is None or self._tokenizer is None:
            raise RuntimeError("model not loaded")

        import torch

        max_tokens = min(max_tokens, MAX_NEW_TOKENS_CAP)
        inputs = self._tokenizer(prompt, return_tensors="pt").to(self._device)
        with torch.no_grad():
            out = self._model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=max(temperature, 1e-4),
                top_p=top_p,
                repetition_penalty=repetition_penalty,
                do_sample=temperature > 0,
                pad_token_id=self._tokenizer.eos_token_id,
            )
        # Slice off the prompt tokens so callers see only the completion.
        prompt_len = inputs["input_ids"].shape[-1]
        completion_ids = out[0][prompt_len:]
        return self._tokenizer.decode(completion_ids, skip_special_tokens=True)

    # Token counting is a best-effort convenience for the ``usage`` field.
    def count_tokens(self, text: str) -> int:
        if self._tokenizer is None:
            # Rough fallback — good enough for the stub / early-boot path.
            return max(1, len(text) // 4)
        return len(self._tokenizer.encode(text, add_special_tokens=False))


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

# The schemas are encoded in the prompt (not only the Pydantic models) so the
# LLM has a single source of truth to copy from. Keep keys in sync with
# backend/prisma expectations.

LEAD_SCHEMA_HINT = """{
  "name": "string",
  "phone": "string|null",
  "email": "string|null",
  "city": "string|null",
  "street": "string|null",
  "interestType": "PRIVATE|COMMERCIAL|null",
  "lookingFor": "BUY|RENT|null",
  "budget": "number|null",
  "rooms": "string|null",
  "notes": "string|null",
  "description": "string|null"
}"""

PROPERTY_SCHEMA_HINT = """{
  "owner": "string",
  "ownerPhone": "string|null",
  "assetClass": "RESIDENTIAL|COMMERCIAL",
  "category": "SALE|RENT",
  "type": "string",
  "city": "string",
  "street": "string",
  "marketingPrice": "number",
  "sqm": "number",
  "rooms": "number|null",
  "floor": "number|null",
  "notes": "string|null"
}"""

LEAD_FEWSHOT = """דוגמה:
תמלול: "היי, מדבר דוד לוי, 0521234567. אני מחפש דירה 4 חדרים בתל אביב עד 3 מיליון שקל."
פלט:
{"name":"דוד לוי","phone":"0521234567","email":null,"city":"תל אביב","street":null,"interestType":"PRIVATE","lookingFor":"BUY","budget":3000000,"rooms":"4","notes":null,"description":"לקוח מחפש דירת 4 חדרים בתל אביב עד 3 מיליון."}"""

PROPERTY_FEWSHOT = """דוגמה:
תמלול: "הבעלים רונית כהן, 0549998877. דירת 5 חדרים למכירה ברחוב דיזנגוף 100 תל אביב, 120 מ"ר, קומה 4, 4.2 מיליון."
פלט:
{"owner":"רונית כהן","ownerPhone":"0549998877","assetClass":"RESIDENTIAL","category":"SALE","type":"דירה","city":"תל אביב","street":"דיזנגוף 100","marketingPrice":4200000,"sqm":120,"rooms":5,"floor":4,"notes":null}"""


def build_extract_prompt(transcript: str, kind: str) -> str:
    if kind == "LEAD":
        schema = LEAD_SCHEMA_HINT
        fewshot = LEAD_FEWSHOT
        role = "ליד (לקוח)"
    else:
        schema = PROPERTY_SCHEMA_HINT
        fewshot = PROPERTY_FEWSHOT
        role = "נכס"
    return (
        "אתה עוזר AI של סוכן נדל\"ן ישראלי. קבל תמלול שיחה בעברית "
        f"והחזר JSON חוקי יחיד בלבד המתאר {role}. אל תוסיף טקסט מחוץ ל-JSON. "
        "אם שדה חסר — החזר null (או השמט עבור שדות חובה).\n\n"
        f"סכמה:\n{schema}\n\n{fewshot}\n\n"
        f"תמלול: \"{transcript}\"\nפלט:\n"
    )


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json(raw: str) -> Optional[dict[str, Any]]:
    """Pull the first balanced JSON object out of ``raw``.

    The model sometimes prefixes ``פלט:`` or wraps the answer in code fences;
    we greedily match the outermost ``{...}`` and parse that.
    """
    if not raw:
        return None
    m = _JSON_RE.search(raw)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


class CompleteRequest(BaseModel):
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.2
    top_p: float = 0.9
    repetition_penalty: float = 1.1
    # Accepted for API compatibility with the orchestrator; not enforced here
    # beyond being passed through. ``/extract-lead`` is the schema-guided path.
    json_schema: Optional[dict[str, Any]] = None


class CompleteResponse(BaseModel):
    text: str
    usage: dict[str, int]


class ExtractRequest(BaseModel):
    transcript: str = Field(min_length=1)
    kind: Literal["LEAD", "PROPERTY"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    runner = ModelRunner(MODEL_ID)
    app.state.runner = runner
    app.state.ready = False
    # Skip the real load when running under pytest — the tests inject a stub.
    if os.environ.get("DICTA_SKIP_LOAD") == "1":
        app.state.ready = True
        logger.info("DICTA_SKIP_LOAD=1, skipping model load")
    else:
        try:
            runner.load()
            app.state.ready = True
        except Exception as exc:
            logger.exception("model load failed: %s", exc)
            # Leave ready=False so /health returns 503 and the orchestrator
            # knows to back off rather than spinning on 500s.
    yield


app = FastAPI(title="estia-ai-dicta", lifespan=lifespan)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.time()
    # Stash on the request so handlers can log with the same id.
    request.state.request_id = rid
    try:
        response = await call_next(request)
    finally:
        elapsed_ms = int((time.time() - start) * 1000)
        logger.info(
            "%s %s %dms",
            request.method,
            request.url.path,
            elapsed_ms,
            extra={"request_id": rid},
        )
    response.headers["x-request-id"] = rid
    return response


@app.get("/health")
async def health(request: Request):
    if not getattr(request.app.state, "ready", False):
        return JSONResponse(
            status_code=503,
            content={"ok": False, "model": MODEL_ID, "reason": "loading"},
        )
    return {"ok": True, "model": MODEL_ID}


@app.post("/complete", response_model=CompleteResponse)
async def complete(body: CompleteRequest, request: Request):
    runner = request.app.state.runner
    if not request.app.state.ready:
        raise HTTPException(status_code=503, detail="model not ready")
    try:
        text = runner.generate(
            body.prompt,
            max_tokens=body.max_tokens,
            temperature=body.temperature,
            top_p=body.top_p,
            repetition_penalty=body.repetition_penalty,
        )
    except Exception as exc:
        logger.exception(
            "generation failed: %s", exc, extra={"request_id": request.state.request_id}
        )
        raise HTTPException(status_code=500, detail="generation failed") from exc
    return CompleteResponse(
        text=text,
        usage={
            "prompt_tokens": runner.count_tokens(body.prompt),
            "completion_tokens": runner.count_tokens(text),
        },
    )


@app.post("/extract-lead")
async def extract_lead(body: ExtractRequest, request: Request):
    runner = request.app.state.runner
    if not request.app.state.ready:
        raise HTTPException(status_code=503, detail="model not ready")

    rid = request.state.request_id
    prompt = build_extract_prompt(body.transcript, body.kind)
    raw = runner.generate(prompt, max_tokens=512, temperature=0.2)
    parsed = extract_json(raw)

    # One retry with a harder instruction if the first pass wasn't valid JSON.
    if parsed is None:
        logger.warning("first extract pass non-JSON, retrying", extra={"request_id": rid})
        retry_prompt = prompt + raw + "\n\nהחזר רק JSON חוקי:\n"
        raw2 = runner.generate(retry_prompt, max_tokens=512, temperature=0.1)
        parsed = extract_json(raw2)
        if parsed is None:
            raise HTTPException(
                status_code=422,
                detail={"error": "invalid_json", "raw": raw2 or raw},
            )

    # Minimal required-field validation — anything stricter lives in the
    # backend so we don't duplicate Prisma's rules here.
    if body.kind == "LEAD" and not parsed.get("name"):
        raise HTTPException(
            status_code=422,
            detail={"error": "missing_required", "field": "name", "raw": parsed},
        )
    if body.kind == "PROPERTY" and not parsed.get("owner"):
        raise HTTPException(
            status_code=422,
            detail={"error": "missing_required", "field": "owner", "raw": parsed},
        )

    return parsed
