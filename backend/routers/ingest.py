import logging
import uuid
import httpx
from io import BytesIO

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from services.neo4j_client import neo4j_client
from services.s3 import upload_file
from services.sqs import enqueue_job

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Constants ─────────────────────────────────────────────────────────────────

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "text/plain",
}

MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# ── Helpers ───────────────────────────────────────────────────────────────────

async def _extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract raw text from PDF bytes using pypdf.
    pypdf is pure Python — no system dependencies, works in ECS/Lambda.
    """
    try:
        import pypdf
        reader = pypdf.PdfReader(BytesIO(file_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages).strip()
        if not text:
            raise ValueError("PDF appears to be scanned/image-only — no extractable text")
        return text
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="pypdf not installed — add it to requirements.txt",
        )


async def _fetch_url_content(url: str) -> tuple[str, str]:
    """
    Fetch a URL and return (raw_text, page_title).
    Uses httpx async — never blocks the event loop.
    Strips HTML tags with a basic approach; for production-grade
    extraction swap in 'trafilatura' or 'readability-lxml'.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=f"URL fetch timed out after 15s: {url}",
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"URL returned {e.response.status_code}: {url}",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not reach URL: {url}",
        )

    content_type = response.headers.get("content-type", "")
    raw_html = response.text

    # Basic HTML → text stripping
    # For production upgrade: pip install trafilatura
    try:
        import trafilatura
        text = trafilatura.extract(raw_html) or raw_html
    except ImportError:
        # Fallback: strip tags with regex (not perfect but works for most pages)
        import re
        text = re.sub(r"<[^>]+>", " ", raw_html)
        text = re.sub(r"\s+", " ", text).strip()

    # Extract title from <title> tag for Neo4j node
    import re
    title_match = re.search(r"<title[^>]*>(.*?)</title>", raw_html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else url

    return text, title


# ── Job tracking ──────────────────────────────────────────────────────────────
# In-memory map: job_id → doc_id
# Lambda updates Neo4j directly (mark_document_indexed / mark_document_failed).
# The status endpoint resolves job_id → doc_id here, then queries Neo4j.
#
# Production note: if you run multiple ECS tasks, move this to ElastiCache Redis
# so all instances share the same job map. Fine for single-container dev/staging.
_job_map: dict[str, str] = {}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(None),
    url: str = Form(None),
    plain_text: str = Form(None),
    title: str = Form(None),
):
    """
    Accept one of: file upload (PDF/TXT), URL, or plain text paste.
    Returns job_id immediately — indexing happens async via Lambda.

    Why 202 and not 201?
    201 = resource created. 202 = request accepted, processing not done yet.
    GraphRAG indexing takes 10-30s — the document isn't ready when we return.
    """
    # ── Validate: exactly one input type ──
    inputs_provided = sum([file is not None, url is not None, plain_text is not None])
    if inputs_provided == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide one of: file, url, or plain_text",
        )
    if inputs_provided > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide only one input type per request",
        )

    doc_id = str(uuid.uuid4())
    raw_text = ""
    doc_title = ""
    source_type = ""
    file_bytes = b""
    s3_key = ""

    # ── Branch: File upload (PDF or TXT) ──
    if file is not None:
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported file type '{file.content_type}'. Allowed: PDF, plain text.",
            )

        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds {MAX_FILE_SIZE_MB}MB limit",
            )

        if file.content_type == "application/pdf":
            raw_text = await _extract_text_from_pdf(file_bytes)
            source_type = "pdf"
        else:
            raw_text = file_bytes.decode("utf-8", errors="replace")
            source_type = "text"

        doc_title = title or file.filename or doc_id
        s3_key = f"docs/{doc_id}/{file.filename}"

    # ── Branch: URL ──
    elif url is not None:
        raw_text, fetched_title = await _fetch_url_content(url)
        doc_title = title or fetched_title
        source_type = "url"
        # Store the raw HTML as bytes for S3 archival
        file_bytes = raw_text.encode("utf-8")
        s3_key = f"docs/{doc_id}/page.txt"

    # ── Branch: Plain text paste ──
    elif plain_text is not None:
        if not plain_text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="plain_text cannot be empty",
            )
        raw_text = plain_text
        doc_title = title or f"Note {doc_id[:8]}"
        source_type = "text"
        file_bytes = plain_text.encode("utf-8")
        s3_key = f"docs/{doc_id}/note.txt"

    # ── Step 1: Save to Neo4j (status=pending via indexed=false) ──
    try:
        neo4j_client.save_document(
            doc_id=doc_id,
            title=doc_title,
            source_type=source_type,
            raw_text=raw_text,
        )
    except Exception as e:
        logger.error(f"Neo4j save failed for doc {doc_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save document metadata",
        )

    # ── Step 2: Upload to S3 ──
    try:
        await upload_file(
            file_bytes=file_bytes,
            s3_key=s3_key,
            content_type="application/pdf" if source_type == "pdf" else "text/plain",
        )
    except Exception as e:
        logger.error(f"S3 upload failed for doc {doc_id}: {e}", exc_info=True)
        # Mark failed in Neo4j so status polling returns a clean error
        neo4j_client.mark_document_failed(doc_id, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file to storage",
        )

    # ── Step 3: Enqueue SQS job for Lambda ──
    try:
        job_id = await enqueue_job(
            doc_id=doc_id,
            s3_key=s3_key,
            filename=doc_title,
        )
    except Exception as e:
        logger.error(f"SQS enqueue failed for doc {doc_id}: {e}", exc_info=True)
        neo4j_client.mark_document_failed(doc_id, str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to queue indexing job",
        )

    # ── Track job_id → doc_id in memory ──
    _job_map[job_id] = doc_id
    logger.info(f"Ingest accepted: job={job_id}, doc={doc_id}, type={source_type}")

    return JSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content={
            "job_id": job_id,
            "doc_id": doc_id,
            "title": doc_title,
            "source_type": source_type,
            "message": "Document accepted. Indexing in progress.",
        },
    )


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """
    Frontend polls this every 3s after upload.
    Resolves job_id → doc_id → Neo4j status.

    Status logic:
        indexed=false, failed=false → "processing"
        indexed=true               → "done"
        failed=true                → "failed"
    """
    doc_id = _job_map.get(job_id)
    if not doc_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job not found: {job_id}",
        )

    doc = neo4j_client.get_document_status(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found for job: {job_id}",
        )

    if doc.get("failed"):
        job_status = "failed"
    elif doc.get("indexed"):
        job_status = "done"
    else:
        job_status = "processing"

    return {
        "job_id": job_id,
        "doc_id": doc_id,
        "status": job_status,
        "title": doc.get("title"),
        "error": doc.get("error"),
        "indexed_at": str(doc.get("indexed_at")) if doc.get("indexed_at") else None,
    }


@router.get("/documents")
async def list_documents():
    """
    Returns all documents for the frontend sidebar.
    Ordered by created_at DESC (newest first) — handled in Neo4j query.
    """
    try:
        docs = neo4j_client.get_all_documents()
        return {"documents": docs, "total": len(docs)}
    except Exception as e:
        logger.error(f"Failed to fetch documents: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve documents",
        )


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: str):
    """
    Deletes document node + all its entities from Neo4j.
    Returns 204 No Content — no body on successful delete.
    Note: does NOT delete from S3 (archival policy — keep raw files).
    """
    doc = neo4j_client.get_document_status(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document not found: {doc_id}",
        )

    try:
        neo4j_client.delete_document(doc_id)
        logger.info(f"Document deleted: {doc_id}")
    except Exception as e:
        logger.error(f"Failed to delete document {doc_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete document",
        )

    return None  # 204 No Content — explicit return for clarity