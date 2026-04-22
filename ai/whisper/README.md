# estia-ai-whisper

Self-contained Hebrew STT service wrapping
[`ivrit-ai/whisper-large-v3-turbo`][model] behind a small FastAPI app.
Called only from the `estia-ai-agent` container over the internal
docker network.

[model]: https://huggingface.co/ivrit-ai/whisper-large-v3-turbo

## Service contract

Base URL inside the compose network: `http://estia-ai-whisper:8080`.

### `GET /health`

```json
{ "ok": true, "model": "ivrit-ai/whisper-large-v3-turbo-ct2" }
```

Returns **503** with `{"ok": false, ...}` while the model is still
loading on boot. The agent container must gate requests behind this.

### `POST /transcribe`

Multipart form:

| Field | Type | Notes |
|-------|------|-------|
| `audio` | file | webm / opus / wav / mp3 / m4a, up to 30 MB |

Query params:

| Param | Default | Notes |
|-------|---------|-------|
| `language` | `he` | Whisper language code |
| `vad` | `true` | silero-vad pre-filter (faster-whisper) |

Response (200):

```json
{ "text": "…Hebrew transcript…", "language": "he", "duration_sec": 12.3 }
```

Errors:

| Status | When |
|--------|------|
| 413 | payload > 30 MB |
| 503 | model not yet ready |

## Backend choice

Primary: **`faster-whisper`** (CTranslate2) loading
`ivrit-ai/whisper-large-v3-turbo-ct2`. CTranslate2 is ~4× faster than
the HF pipeline on CPU at int8 and lands inside the 30 MB weight budget
on disk for the turbo variant.

Fallback: **`transformers`** loading the non-ct2 model id
`ivrit-ai/whisper-large-v3-turbo` via `AutoModelForSpeechSeq2Seq` +
`AutoProcessor`. Triggered automatically if the ct2 checkpoint is
missing on the Hub at boot time — `app.py` logs a `faster-whisper
unavailable` warning and continues.

> **Caveat:** at time of writing the ivrit-ai team has published the HF
> model but the **ct2-converted repo may not be public yet**. If
> `faster-whisper` raises on download, you will see the transformers
> fallback path kick in; expect a ~3× slowdown on CPU. If ct2 is
> unavailable for long, we can convert it ourselves with
> `ct2-transformers-converter` and host it in our HF org.

## GPU deployment

The CPU Dockerfile boots anywhere (laptops, CI). For production
inference copy to `Dockerfile.gpu`:

```Dockerfile
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
RUN apt-get update && apt-get install -y python3.11 python3.11-venv \
    ffmpeg libsndfile1 curl && rm -rf /var/lib/apt/lists/*
# …then the rest of this Dockerfile unchanged.
```

At runtime `app.py` calls `torch.cuda.is_available()` and flips to
`device="cuda"`, `compute_type="float16"` automatically.

## Local run

```bash
cd ai/whisper
docker build -t estia-ai-whisper:local .
docker run --rm -p 8080:8080 -v "$(pwd)/models:/models" estia-ai-whisper:local
# ~1.5 GB of weights downloads to ./models on first boot.
curl -F audio=@sample.webm http://localhost:8080/transcribe
```

Weights are cached to `/models` inside the container; mount a host
volume to avoid re-downloading between runs.

## Environment

| Var | Default | Purpose |
|-----|---------|---------|
| `WHISPER_MODEL_CT2` | `ivrit-ai/whisper-large-v3-turbo-ct2` | primary model id |
| `WHISPER_MODEL_HF` | `ivrit-ai/whisper-large-v3-turbo` | fallback model id |
| `WHISPER_MAX_BYTES` | `31457280` | reject bodies larger than this |
| `WHISPER_MODELS_DIR` | `/models` | HF + CT2 cache root |
| `ESTIA_WHISPER_SKIP_LOAD` | unset | if `1`, skip model load (tests) |

## Tests

```bash
pip install fastapi httpx pytest python-multipart
ESTIA_WHISPER_SKIP_LOAD=1 pytest tests/ai/whisper -q
```

The test file stubs `state.transcribe_fn` — no weights, no ffmpeg, runs
in under a second.
