# ── Build stage ─────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies for native extensions (numpy, pandas, lancedb)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=100 --prefix=/install -r requirements.txt

# ── Runtime stage ───────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Unbuffered stdout so logs reach CloudWatch in real time, not delayed
# in chunks — makes live debugging on ECS actually usable.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code (respects .dockerignore — .env never gets in here)
COPY . .

# Create graphrag workdir (writable at runtime)
RUN mkdir -p /app/graphrag_workdir/output/artifacts \
             /app/graphrag_workdir/vector_store

# Non-root user for security
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Uvicorn listens on 8000 by default
EXPOSE 8000

# Health check — ECS calls /health every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run with uvicorn — 1 worker because we use in-memory state (_job_map).
# NOTE: this means desiredCount on the ECS service must stay at 1 —
# more tasks means each has its own job_map and status polling breaks.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
