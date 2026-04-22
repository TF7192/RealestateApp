"""
Estia Whisper STT service.

Wraps ivrit-ai/whisper-large-v3-turbo (Hebrew-tuned) behind a tiny FastAPI
so the agent container can POST /transcribe and get Hebrew text back.

Service contract (load-bearing — the agent container depends on this):

    GET  /health      -> 200 {"ok": true, "model": "..."} when warm; 503 while loading
    POST /transcribe  -> multipart field "audio", optional ?language=he&vad=true

Backend preference:
    1. faster-whisper (CTranslate2) loading "ivrit-ai/whisper-large-v3-turbo-ct2"
    2. fallback: transformers AutoModelForSpeechSeq2Seq on the non-ct2 model id
See README.md for rationale and GPU notes.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse


# -- Config ------------------------------------------------------------------

MODEL_ID_CT2 = os.environ.get(
    "WHISPER_MODEL_CT2", "ivrit-ai/whisper-large-v3-turbo-ct2"
)
MODEL_ID_HF = os.environ.get(
    "WHISPER_MODEL_HF", "ivrit-ai/whisper-large-v3-turbo"
)
MAX_BYTES = int(os.environ.get("WHISPER_MAX_BYTES", 30 * 1024 * 1024))  # 30 MB
MODELS_DIR = os.environ.get("WHISPER_MODELS_DIR", "/models")


# -- Structured JSON logging (pino-style) ------------------------------------


class JsonFormatter(logging.Formatter):
    """Emit one JSON object per line: {ts, level, msg, ...extra}."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload: dict[str, Any] = {
            "ts": int(time.time() * 1000),
            "level": record.levelname.lower(),
            "msg": record.getMessage(),
            "logger": record.name,
        }
        # Any dict passed via `extra={"extra": {...}}` is merged in.
        extra = getattr(record, "extra", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_logging() -> logging.Logger:
    root = logging.getLogger()
    # Don't double-install in reloader/test scenarios.
    if not any(isinstance(h, logging.StreamHandler) and isinstance(h.formatter, JsonFormatter) for h in root.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JsonFormatter())
        root.handlers = [handler]
    root.setLevel(logging.INFO)
    return logging.getLogger("estia.whisper")


log = _configure_logging()


# -- Model loader ------------------------------------------------------------


class ModelState:
    """Lazy holder so the FastAPI app can be imported (for tests) before the
    big model touches disk."""

    def __init__(self) -> None:
        self.ready: bool = False
        self.model_id: str = MODEL_ID_CT2
        self.backend: str = "faster-whisper"
        self.device: str = "cpu"
        self.compute_type: str = "int8"
        # Either a faster_whisper.WhisperModel or a dict-ish transformers
        # pipeline. Tests inject a stub via `state.transcribe_fn`.
        self._model: Any = None
        # Tests can replace this callable directly.
        self.transcribe_fn = self._default_transcribe

    def _detect_device(self) -> tuple[str, str]:
        try:
            import torch  # type: ignore

            if torch.cuda.is_available():
                return "cuda", "float16"
        except Exception:  # pragma: no cover - torch optional at import time
            pass
        return "cpu", "int8"

    def load(self) -> None:
        """Blocking model load — called from the lifespan startup hook."""
        self.device, self.compute_type = self._detect_device()
        # Try faster-whisper first.
        try:
            from faster_whisper import WhisperModel  # type: ignore

            log.info(
                "loading model",
                extra={"extra": {
                    "backend": "faster-whisper",
                    "model": MODEL_ID_CT2,
                    "device": self.device,
                    "compute_type": self.compute_type,
                }},
            )
            self._model = WhisperModel(
                MODEL_ID_CT2,
                device=self.device,
                compute_type=self.compute_type,
                download_root=MODELS_DIR,
            )
            self.backend = "faster-whisper"
            self.model_id = MODEL_ID_CT2
            self.ready = True
            return
        except Exception as e:
            log.warning(
                "faster-whisper unavailable, falling back to transformers",
                extra={"extra": {"err": str(e)}},
            )

        # Fallback: transformers pipeline.
        try:
            import torch  # type: ignore
            from transformers import (  # type: ignore
                AutoModelForSpeechSeq2Seq,
                AutoProcessor,
                pipeline,
            )

            log.info(
                "loading model",
                extra={"extra": {
                    "backend": "transformers",
                    "model": MODEL_ID_HF,
                    "device": self.device,
                }},
            )
            torch_dtype = torch.float16 if self.device == "cuda" else torch.float32
            model = AutoModelForSpeechSeq2Seq.from_pretrained(
                MODEL_ID_HF,
                torch_dtype=torch_dtype,
                cache_dir=MODELS_DIR,
                low_cpu_mem_usage=True,
            )
            model.to(self.device)
            processor = AutoProcessor.from_pretrained(MODEL_ID_HF, cache_dir=MODELS_DIR)
            self._model = pipeline(
                "automatic-speech-recognition",
                model=model,
                tokenizer=processor.tokenizer,
                feature_extractor=processor.feature_extractor,
                torch_dtype=torch_dtype,
                device=self.device,
            )
            self.backend = "transformers"
            self.model_id = MODEL_ID_HF
            self.ready = True
        except Exception as e:
            log.error("model load failed", extra={"extra": {"err": str(e)}})
            raise

    # ----- transcription ---------------------------------------------------

    def _default_transcribe(
        self, path: str, language: str, vad: bool
    ) -> tuple[str, float]:
        """Real transcription path. Tests replace this with a stub."""
        if not self.ready or self._model is None:
            raise RuntimeError("model not ready")
        if self.backend == "faster-whisper":
            segments, info = self._model.transcribe(
                path,
                language=language,
                vad_filter=vad,
                beam_size=1,
            )
            text = "".join(seg.text for seg in segments).strip()
            duration = float(getattr(info, "duration", 0.0) or 0.0)
            return text, duration
        # transformers pipeline
        result = self._model(
            path,
            return_timestamps=False,
            generate_kwargs={"language": language, "task": "transcribe"},
        )
        text = (result.get("text") or "").strip() if isinstance(result, dict) else str(result)
        return text, 0.0


state = ModelState()


# -- FastAPI app -------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Allow tests / CI to skip the real load. The test suite sets
    # ESTIA_WHISPER_SKIP_LOAD=1 and marks `state.ready = True` itself.
    if os.environ.get("ESTIA_WHISPER_SKIP_LOAD") == "1":
        log.info("skip model load (test mode)")
    else:
        try:
            state.load()
        except Exception:
            # Don't crash the container — /health will report not-ready,
            # and k8s/compose can surface the failure.
            log.exception("startup model load failed")
    yield


app = FastAPI(title="estia-ai-whisper", lifespan=lifespan)


@app.middleware("http")
async def request_logger(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex
    start = time.perf_counter()
    response = await call_next(request)
    dur_ms = int((time.perf_counter() - start) * 1000)
    log.info(
        "request",
        extra={"extra": {
            "rid": rid,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "dur_ms": dur_ms,
        }},
    )
    response.headers["x-request-id"] = rid
    return response


@app.get("/health")
async def health() -> JSONResponse:
    body = {"ok": state.ready, "model": state.model_id}
    if not state.ready:
        return JSONResponse(body, status_code=503)
    return JSONResponse(body, status_code=200)


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Query("he"),
    vad: bool = Query(True),
) -> JSONResponse:
    if not state.ready:
        raise HTTPException(status_code=503, detail="model loading")

    # Streamed size check: read in chunks, bail at MAX_BYTES + 1.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=_suffix_for(audio.filename))
    total = 0
    try:
        while True:
            chunk = await audio.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                tmp.close()
                os.unlink(tmp.name)
                raise HTTPException(
                    status_code=413,
                    detail=f"audio exceeds {MAX_BYTES} bytes",
                )
            tmp.write(chunk)
        tmp.close()

        t0 = time.perf_counter()
        text, duration_sec = state.transcribe_fn(tmp.name, language, vad)
        stt_ms = int((time.perf_counter() - t0) * 1000)
        log.info(
            "transcribe",
            extra={"extra": {
                "bytes": total,
                "duration_sec": duration_sec,
                "stt_ms": stt_ms,
                "lang": language,
                "vad": vad,
            }},
        )
        return JSONResponse({
            "text": text,
            "language": language,
            "duration_sec": duration_sec,
        })
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def _suffix_for(filename: str | None) -> str:
    if not filename or "." not in filename:
        return ".bin"
    return "." + filename.rsplit(".", 1)[-1].lower()
