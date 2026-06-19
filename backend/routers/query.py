import logging

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.neo4j_client import neo4j_client
from services.llm import llm_service, QueryMode
from services.graphrag import graphrag_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request schema ────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    mode: QueryMode = QueryMode.DISCOVER
    doc_ids: list[str] | None = None  # None = search across all documents

    class Config:
        # Accept mode as string ("discover") or enum value
        use_enum_values = True


# ── Helper ────────────────────────────────────────────────────────────────────

async def _build_context(question: str, mode: QueryMode, doc_ids: list[str] | None) -> str:
    """
    Build context string for the LLM from two sources:

    1. GraphRAG search result — entity/relationship summaries extracted by Lambda
    2. Neo4j entity search — direct entity matches for the question keywords

    Why both?
    - GraphRAG gives rich relationship context (how concepts connect)
    - Neo4j entity search gives exact matches (what is directly relevant)
    - Together they give the LLM both depth and precision

    Args:
        question: user's question
        mode: determines GraphRAG search strategy (global vs local)
        doc_ids: optional filter — None means all documents

    Returns:
        Combined context string injected into the LLM system prompt.
    """
    context_parts = []

    # ── Part 1: GraphRAG search ──
    # Discover mode → global search (community summaries, broad patterns)
    # Connect/Challenge → local search (specific entity neighborhoods)
    try:
        if mode == QueryMode.DISCOVER:
            graphrag_result = await graphrag_service.global_search(query=question)
        else:
            graphrag_result = await graphrag_service.local_search(query=question)

        if graphrag_result and graphrag_result.response:
            context_parts.append(f"## GraphRAG Insights\n{graphrag_result.response}")
    except Exception as e:
        # Non-fatal — fall back to Neo4j-only context
        logger.warning(f"GraphRAG search failed, falling back to Neo4j only: {e}")

    # ── Part 2: Neo4j entity search ──
    # Direct keyword match on entity names and descriptions
    try:
        entities = neo4j_client.search_entities(question)
        if entities:
            entity_lines = []
            for e in entities:
                entity_lines.append(
                    f"- [{e.get('type', 'entity').upper()}] {e['name']}: {e.get('description', '')}"
                )
            entity_context = "\n".join(entity_lines)
            context_parts.append(f"## Relevant Entities\n{entity_context}")
    except Exception as e:
        logger.warning(f"Neo4j entity search failed: {e}")

    if not context_parts:
        return "No relevant knowledge found in your Second Brain for this question."

    return "\n\n".join(context_parts)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("")
async def query_knowledge(request: QueryRequest):
    """
    Main query endpoint — streams LLM response as Server-Sent Events.

    Why StreamingResponse instead of a normal JSON response?
    GraphRAG + LLM generation takes 5-15s. SSE lets the frontend show
    tokens as they arrive instead of a blank screen with a spinner.

    Frontend usage:
        const response = await fetch("/api/query", { method: "POST", body: ... })
        const reader = response.body.getReader()
        // read chunks, split on \\n\\n, strip "data: ", parse JSON
        // type=chunk → append to display
        // type=done  → stop
        // type=error → show error

    The X-Accel-Buffering: no header is critical — without it, nginx and
    CloudFront buffer the entire response before sending, killing the stream.
    """
    if not request.question.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question cannot be empty",
        )

    if len(request.question) > 2000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question too long — max 2000 characters",
        )

    logger.info(
        f"Query received | mode={request.mode} | doc_ids={request.doc_ids} "
        f"| question_len={len(request.question)}"
    )

    # Build context outside the stream generator
    # If context building fails entirely, return 500 before opening the stream
    try:
        context = await _build_context(
            question=request.question,
            mode=QueryMode(request.mode),
            doc_ids=request.doc_ids,
        )
    except Exception as e:
        logger.error(f"Context building failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve knowledge context",
        )

    # Stream generator — wraps llm_service.stream_response()
    async def generate():
        async for chunk in llm_service.stream_response(
            query=request.question,
            context=context,
            mode=QueryMode(request.mode),
        ):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disables nginx/CloudFront buffering
        },
    )


@router.get("/modes")
async def get_query_modes():
    """
    Returns available query modes with descriptions.
    Frontend uses this to populate the mode selector UI.
    """
    return {
        "modes": [
            {
                "value": "discover",
                "label": "Discover",
                "description": "Find broad patterns and themes across your entire knowledge base",
            },
            {
                "value": "connect",
                "label": "Connect",
                "description": "Understand how new information relates to what you already know",
            },
            {
                "value": "challenge",
                "label": "Challenge",
                "description": "Surface contradictions, tensions, and weak assumptions",
            },
        ]
    }