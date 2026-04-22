# Estia AI orchestrator container.
# Stays on python:3.11-slim — no native deps required (httpx is pure-Python,
# FastAPI + uvicorn ship manylinux wheels). Keeps the image under 200MB.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Copy requirements first so `pip install` is cached across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

# The service listens on PORT (default 8080). compose can override via env.
ENV PORT=8080
EXPOSE 8080

# --proxy-headers so X-Forwarded-* from any nginx-in-front is respected.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
