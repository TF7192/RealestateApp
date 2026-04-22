# estia-ai-agent

FastAPI orchestrator that turns an agent's voice recording into a Lead or Property row in Estia.

## Pipeline

    audio (multipart) ──▶ whisper /transcribe  ──▶ text
                                                        │
                                                        ▼
                                               dicta /extract-lead ──▶ structured JSON
                                                        │
                                                        ▼
                                              estia POST /api/leads or /api/properties
                                                        │
                                           ┌────────────┴────────────┐
                                           ▼                         ▼
                                 2xx → mode=created      400 → mode=draft
                                 (entity returned)       (user fills gaps in UI)

## Endpoints

- `GET /health` — 200 when whisper AND dicta are both reachable, else 503.
- `POST /process` — multipart, field `audio`, query `?kind=LEAD|PROPERTY`
  (default `LEAD`), header `X-Agent-Actor-Id` (forwarded by the backend).
  Returns `{transcript, extracted, created, mode}`.

## Environment

| var                   | default                         | notes |
| --------------------- | ------------------------------- | ----- |
| `WHISPER_URL`         | `http://estia-ai-whisper:8080`  | STT service |
| `DICTA_URL`           | `http://estia-ai-dicta:8080`    | Hebrew NLU / extraction |
| `ESTIA_API_URL`       | `http://estia-backend:4000`     | backend to push created rows to |
| `ESTIA_SERVICE_TOKEN` | (empty — required)              | service-to-service token; matches backend `ESTIA_SERVICE_TOKEN` |
| `PORT`                | `8080`                          |

Only the three upstream hostnames above are allowed as outbound targets.
Docker-compose network isolation enforces this at the network layer;
the container also guards it inside httpx (see `_assert_outbound_allowed`
in `app.py`) so a code-level mistake can't reach the public internet.

## Timeouts

- Whisper: 60s (audio upload + Hebrew STT is slow).
- Dicta: 30s.
- Estia: 10s (plain DB insert).

## Running locally

    docker build -t estia-ai-agent .
    docker run --rm -e ESTIA_SERVICE_TOKEN=dev -p 8080:8080 estia-ai-agent

## Tests

    pytest tests/ai/agent -v

The test suite mocks the three upstream services with `respx`, so no
containers are needed. See `tests/ai/agent/test_pipeline.py`.
