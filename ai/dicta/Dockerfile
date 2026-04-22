# Dicta Hebrew LLM inference container (CPU-bootable).
#
# Sibling Dockerfile.gpu is referenced in README.md for CUDA builds — it
# swaps the base image to nvidia/cuda and reinstalls torch against the cu121
# wheel index. Keeping the default on CPU means dev machines and the EC2
# staging box (no GPU) can still boot the image for smoke tests.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/models \
    TRANSFORMERS_CACHE=/models \
    MODEL_ID=dicta-il/dictalm2.0-instruct

# Minimal system deps:
#   - git: some HF models pull tokenizer/config via git-lfs references
#   - curl: used by the HEALTHCHECK below
#   - build-essential: kept out on purpose; torch + transformers ship wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for better layer caching.
COPY requirements.txt /app/requirements.txt
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.4.1 \
    && pip install -r /app/requirements.txt

COPY app.py /app/app.py

# Weights live on a mounted volume so container restarts don't re-download
# many-GB blobs. The orchestrator compose mounts this to a named volume.
RUN mkdir -p /models
VOLUME ["/models"]

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--log-level", "info"]
