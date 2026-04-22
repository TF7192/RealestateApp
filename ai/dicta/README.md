# estia-ai-dicta

FastAPI wrapper around a Dicta-IL Hebrew instruct LLM, serving the Estia
voice-to-lead orchestrator at `http://estia-ai-dicta:8080`.

## Model choice

The default `MODEL_ID` is **`dicta-il/dictalm2.0-instruct`** — the largest
publicly published Dicta-IL instruct model available on Hugging Face today.

**DictaLM 3.0 may not be public yet.** If / when Dicta publishes a 3.0
instruct checkpoint on the Hub, operators can flip to it with a single
environment variable — **no code change, no rebuild**:

```bash
docker run -e MODEL_ID=dicta-il/dictalm-3.0-instruct ...
```

The container will download the new weights on first boot (cached into the
`/models` volume) and the `/health` payload will reflect the resolved id.

## Endpoints

| Method | Path            | Purpose                                                  |
| ------ | --------------- | -------------------------------------------------------- |
| GET    | `/health`       | `{ok, model}` once warm; 503 while loading / on failure. |
| POST   | `/complete`     | Raw completion. Body: `{prompt, max_tokens, temperature, top_p, repetition_penalty, json_schema?}`. |
| POST   | `/extract-lead` | Hebrew-transcript → strict JSON matching the Estia LEAD / PROPERTY schema. |

### `/extract-lead`

Request body:

```json
{ "transcript": "<Hebrew speech>", "kind": "LEAD" | "PROPERTY" }
```

For `kind=LEAD` the response matches:

```json
{
  "name": "string",            // required
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
}
```

For `kind=PROPERTY`:

```json
{
  "owner": "string",           // required
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
}
```

On invalid model output the service retries once with a stricter
"החזר רק JSON חוקי" instruction; a second failure returns HTTP 422 with the
raw model text.

## Running

### CPU (default — slow but dependency-free)

```bash
docker build -t estia-ai-dicta -f ai/dicta/Dockerfile ai/dicta
docker run --rm -p 8080:8080 -v dicta-models:/models estia-ai-dicta
```

The first boot downloads ~7 GB of weights into the `/models` volume; keep
the volume around or every restart re-downloads.

### GPU

A sibling `Dockerfile.gpu` is planned (not shipped yet). Swap the base to
`nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04`, reinstall torch against
`--extra-index-url https://download.pytorch.org/whl/cu121`, and pass
`--gpus all` at `docker run`. On GPU the code path auto-selects
`torch.float16`; on CPU it stays on `float32`.

### Environment variables

| Var                 | Default                         | Notes                                  |
| ------------------- | ------------------------------- | -------------------------------------- |
| `MODEL_ID`          | `dicta-il/dictalm2.0-instruct`  | Any causal-LM repo id on the Hub.      |
| `HF_HOME`           | `/models`                       | Weight cache. Mount this as a volume.  |
| `MAX_NEW_TOKENS_CAP`| `1024`                          | Upper bound on `max_tokens`.           |
| `LOG_LEVEL`         | `INFO`                          | Standard Python logging level.         |
| `DICTA_SKIP_LOAD`   | _unset_                         | Test-only: boot with no weights.       |

## Tests

Run from the repo root:

```bash
pytest tests/ai/dicta -q
```

The tests monkey-patch the `ModelRunner` with a stub that returns fixed
strings, so they never touch real weights — they run in milliseconds on
CI and locally.

## Caveats

- **CPU inference is slow** (tens of seconds for a 512-token completion
  on a 7B model). Production should run the GPU variant.
- **Cold start** downloads the weights; expect 5–10 minutes on first
  boot depending on network. The `HEALTHCHECK` has a 120 s
  `start-period` but may need lengthening on the prod box.
- The `json_schema` field on `/complete` is accepted for API symmetry
  with the orchestrator, but schema-conforming generation is only
  implemented in `/extract-lead` (prompt-guided + JSON-validation retry).
  Structured output via grammars is a possible upgrade.
