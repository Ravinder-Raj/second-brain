"""
Lambda Handler
==============
Entry point for the indexing Lambda function.

Trigger: SQS queue (batch size 1 — one document per invocation)
Timeout: 15 minutes (GraphRAG indexing takes 1–5 min per document)
Memory:  1024MB minimum (GraphRAG loads parquet files into memory)

Flow:
  1. Parse SQS event → get job_id, doc_id, s3_key, filename
  2. Fetch file bytes from S3
  3. Decode text (PDF extraction or plain decode)
  4. Run GraphRAG indexing → IndexingResult
  5. Write entities, relationships, communities to Neo4j
  6. Mark document as indexed (or failed) in Neo4j

What this file does NOT do:
  - Know about FastAPI or HTTP
  - Send responses to the frontend (status polling hits Neo4j directly)
  - Retry logic (SQS handles retries via visibility timeout + DLQ)
"""

import logging
import os
import sys

# ── Logging — must be configured before any imports that use logging ──────────
# Lambda replaces the root handler on cold start. FORMAT must include requestId
# for CloudWatch Insights filtering.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ── Lazy imports — keep cold start fast ──────────────────────────────────────
# These are imported inside the handler so Lambda's init phase stays quick.
# The actual work (GraphRAG, Neo4j, S3) only loads when a message arrives.

def handler(event: dict, context) -> dict:
    """
    Lambda entry point.

    Args:
        event:   SQS event dict with Records list
        context: Lambda context (used for request ID in logs)

    Returns:
        {"statusCode": 200, "processed": N} on full success
        Raises exception on failure so SQS retries the message.

    SQS retry behaviour:
        If this function raises, SQS makes the message visible again after
        the visibility timeout and retries up to maxReceiveCount times.
        After maxReceiveCount, the message moves to the Dead Letter Queue (DLQ).
        We raise on failure rather than swallowing errors so bad messages
        eventually land in the DLQ for inspection — not silently dropped.
    """
    request_id = getattr(context, "aws_request_id", "local")
    logger.info(f"Lambda invoked | request_id={request_id} | records={len(event.get('Records', []))}")

    # Import here — not at module level — to keep cold start fast
    from services.sqs import parse_message
    from services.s3 import get_file
    from services.neo4j_client import neo4j_client
    from services.graphrag import graphrag_service

    # Connect Neo4j — Lambda is stateless, no lifespan events
    # Connection is reused across warm invocations (module-level singleton)
    _ensure_neo4j_connected(neo4j_client)

    # Parse all SQS records (batch size is 1 in our config but handle N)
    jobs = parse_message(event)
    logger.info(f"Parsed {len(jobs)} job(s) from SQS event")

    processed = 0
    for job in jobs:
        _process_job(job, neo4j_client, graphrag_service, get_file)
        processed += 1

    logger.info(f"Lambda complete | processed={processed} | request_id={request_id}")
    return {"statusCode": 200, "processed": processed}


def _ensure_neo4j_connected(neo4j_client) -> None:
    """
    Connect Neo4j driver if not already connected.
    On warm Lambda invocations the driver persists in memory — skip reconnect.
    On cold start the driver is None — connect now.
    """
    if neo4j_client.driver is None:
        logger.info("Cold start — connecting Neo4j")
        neo4j_client.connect()
    else:
        logger.debug("Warm invocation — reusing Neo4j connection")


def _process_job(job: dict, neo4j_client, graphrag_service, get_file_fn) -> None:
    """
    Process a single indexing job end-to-end.

    Wraps the full pipeline in try/except so one failed document
    doesn't prevent other documents in the same batch from processing.
    Marks the document as failed in Neo4j on any error.

    Uses a single event loop for all async calls — avoids the
    "RuntimeError: This event loop is already running" that happens
    when calling asyncio.run() multiple times in Lambda runtimes
    that already have an active event loop.

    Args:
        job:              parsed SQS message dict {job_id, doc_id, s3_key, filename}
        neo4j_client:     Neo4jClient singleton
        graphrag_service: GraphRAGService singleton
        get_file_fn:      s3.get_file function (injected for testability)
    """
    import asyncio

    doc_id   = job["doc_id"]
    s3_key   = job["s3_key"]
    filename = job["filename"]
    job_id   = job["job_id"]

    logger.info(f"Processing job | job_id={job_id} doc_id={doc_id} s3_key={s3_key}")

    # Create a single event loop for all async calls in this job.
    # This avoids calling asyncio.run() twice (which would fail if a loop
    # is already running in the Lambda Python runtime).
    loop = asyncio.new_event_loop()

    try:
        # ── Step 1: Fetch file from S3 ──
        logger.info(f"Fetching from S3 | key={s3_key}")
        file_bytes = loop.run_until_complete(get_file_fn(s3_key))
        logger.info(f"S3 fetch complete | size={len(file_bytes)} bytes")

        # ── Step 2: Decode to text ──
        text = _extract_text(file_bytes, s3_key)
        if not text.strip():
            raise ValueError(f"Extracted text is empty for doc {doc_id}")
        logger.info(f"Text extracted | chars={len(text)}")

        # ── Step 3: Run GraphRAG indexing ──
        logger.info(f"Starting GraphRAG indexing | doc_id={doc_id}")
        result = loop.run_until_complete(graphrag_service.run_indexing(doc_id=doc_id, text=text))
        logger.info(
            f"GraphRAG complete | doc_id={doc_id} "
            f"entities={len(result.entities)} "
            f"relationships={len(result.relationships)} "
            f"communities={len(result.communities)}"
        )

        # ── Step 4: Write to Neo4j ──
        _write_to_neo4j(result, neo4j_client)

        # ── Step 5: Mark document as indexed ──
        neo4j_client.mark_document_indexed(doc_id)
        logger.info(f"Document indexed successfully | doc_id={doc_id} job_id={job_id}")

    except FileNotFoundError as e:
        # S3 key missing — don't retry (message is likely corrupt)
        error_msg = f"S3 file not found: {s3_key}"
        logger.error(f"{error_msg} | doc_id={doc_id}")
        neo4j_client.mark_document_failed(doc_id, error_msg)
        # Don't raise — no point retrying a missing file

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)[:500]}"
        logger.exception(f"Indexing failed | doc_id={doc_id} | error={error_msg}")
        neo4j_client.mark_document_failed(doc_id, error_msg)
        # Raise so SQS retries the message (transient failures like NIM timeout)
        raise

    finally:
        loop.close()


def _extract_text(file_bytes: bytes, s3_key: str) -> str:
    """
    Decode file bytes to text.

    PDF files → extract text with pypdf
    Everything else → UTF-8 decode (plain text, URL-fetched content)

    We detect PDF by the s3_key suffix rather than magic bytes because
    the key is reliable (set by ingest.py) and avoids importing python-magic.
    """
    if s3_key.endswith(".pdf") or "/document.pdf" in s3_key:
        return _extract_pdf_text(file_bytes)
    return file_bytes.decode("utf-8", errors="replace")


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract text from PDF bytes using pypdf."""
    try:
        import pypdf
        from io import BytesIO

        reader = pypdf.PdfReader(BytesIO(file_bytes))
        pages  = [page.extract_text() or "" for page in reader.pages]
        text   = "\n".join(pages).strip()

        if not text:
            raise ValueError("PDF appears to be image-only — no extractable text found")

        logger.info(f"PDF extracted | pages={len(reader.pages)} chars={len(text)}")
        return text

    except ImportError:
        raise RuntimeError("pypdf not installed in Lambda layer — add to requirements.txt")


def _write_to_neo4j(result, neo4j_client) -> None:
    """
    Write IndexingResult (entities, relationships, communities) to Neo4j.

    Order matters:
      1. Entities first — relationships reference entity names
      2. Relationships second — both endpoints must exist
      3. Communities last — reference entity IDs

    Each write uses MERGE (not CREATE) in neo4j_client so re-indexing
    the same document updates nodes instead of creating duplicates.
    """
    doc_id = result.doc_id

    # ── Entities ──
    logger.info(f"Writing {len(result.entities)} entities | doc_id={doc_id}")
    for entity in result.entities:
        try:
            neo4j_client.save_entity(
                entity_id   = entity.id,
                name        = entity.name,
                entity_type = entity.type,
                description = entity.description,
                doc_id      = doc_id,
            )
        except Exception as e:
            # Log and continue — one bad entity shouldn't kill the whole document
            logger.warning(f"Failed to save entity {entity.id} ({entity.name}): {e}")

    # ── Relationships ──
    logger.info(f"Writing {len(result.relationships)} relationships | doc_id={doc_id}")
    for rel in result.relationships:
        try:
            neo4j_client.save_relationship(
                source_id   = _name_to_id(rel.source, result.entities),
                target_id   = _name_to_id(rel.target, result.entities),
                rel_type    = rel.type,
                description = rel.description,
            )
        except Exception as e:
            logger.warning(f"Failed to save relationship {rel.source}→{rel.target}: {e}")

    # ── Communities ──
    logger.info(f"Writing {len(result.communities)} communities | doc_id={doc_id}")
    for community in result.communities:
        try:
            neo4j_client.save_community(
                community_id = community.id,
                title        = community.title,
                summary      = community.summary,
                level        = community.level,
                doc_id       = doc_id,
            )
        except Exception as e:
            logger.warning(f"Failed to save community {community.id}: {e}")


def _name_to_id(name: str, entities: list) -> str:
    """
    Resolve entity name → entity ID for relationship writing.
    GraphRAG relationships reference entities by name, not ID.
    Falls back to the name itself if no match found (neo4j_client handles gracefully).
    """
    for entity in entities:
        if entity.name == name:
            return entity.id
    logger.warning(f"Entity name not found in result set: '{name}' — using name as ID fallback")
    return name
