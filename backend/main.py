import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from services.neo4j_client import neo4j_client
from routers import ingest, query, graph

# ── Logging ──────────────────────────────────────────────────────────────────
# INFO in production, DEBUG locally — both go to stdout so CloudWatch picks them up
logging.basicConfig(
    level=logging.DEBUG if not settings.is_production else logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────────────
# Replaces deprecated @app.on_event("startup") / ("shutdown")
# Everything before `yield` runs on startup, everything after on shutdown.
@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    logger.info(f"Starting Second Brain API  [env={settings.app_env}]")
    try:
        neo4j_client.connect()  # lazy init — driver created here, not at import
        logger.info("Neo4j connected ✓")
    except Exception as e:
        # Crash on startup if DB is unreachable — better than silent failure
        logger.error(f"Neo4j connection failed on startup: {e}", exc_info=True)
        raise

    yield  # app is running and serving requests

    # --- shutdown ---
    logger.info("Shutting down — closing Neo4j connection")
    neo4j_client.close()


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Second Brain API",
    description="GraphRAG-powered personal knowledge OS",
    version="1.0.0",
    # Disable docs in production — no need to expose schema publicly
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    lifespan=lifespan,
)


# ── CORS ──────────────────────────────────────────────────────────────────────
# cors_origin property on settings splits the comma-separated string into a list
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(query.router,  prefix="/api/query",  tags=["query"])
app.include_router(graph.router,  prefix="/api/graph",  tags=["graph"])


# ── Health check ─────────────────────────────────────────────────────────────
# Lives in main.py, not a router — it's an infrastructure endpoint, not a feature.
# ECS calls this every 30s. Returns 200 only if Neo4j is reachable.
# If this returns non-200, ECS marks the container unhealthy and restarts it.
@app.get("/health", tags=["health"])
async def health_check():
    try:
        neo4j_client.verify_connection()
        return {
            "status": "healthy",
            "env": settings.app_env,
            "neo4j": "connected",
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        # 503 tells ECS load balancer to stop routing traffic to this container
        from fastapi import Response
        return Response(
            content='{"status": "unhealthy", "neo4j": "disconnected"}',
            status_code=503,
            media_type="application/json",
        )