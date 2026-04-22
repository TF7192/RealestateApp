# Estia Whisper STT — CPU image.
#
# For GPU: copy this to Dockerfile.gpu and change the base to
#   nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
# then apt-get install python3.11. The rest is identical.
#
# Build:  docker build -t estia-ai-whisper:local ai/whisper
# Run:    docker run --rm -p 8080:8080 -v $(pwd)/models:/models estia-ai-whisper:local
FROM python:3.11-slim

# ffmpeg: whisper needs it to decode webm/opus/m4a
# libsndfile1: soundfile backend for some transformers paths
# curl: HEALTHCHECK
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/models \
    WHISPER_MODELS_DIR=/models

WORKDIR /app

# Deps first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App
COPY app.py .

RUN mkdir -p /models

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

# --workers 1 on purpose: the model isn't fork-safe and each worker
# would try to reload the 1.5 GB weights.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
