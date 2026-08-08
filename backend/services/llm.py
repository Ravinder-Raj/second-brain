"""
LLM Service (llm.py)
====================
LangChain + NVIDIA NIM — final answer generation with SSE streaming.

Responsibilities:
  - Connect to NVIDIA NIM (Llama 3.1 8B) via LangChain's ChatOpenAI
  - Format prompts for each of the three modes (Discover / Connect / Challenge)
  - Stream the LLM response as Server-Sent Events (SSE)

What this file does NOT do:
  - Call GraphRAG         → graphrag_service.py does that
  - Know about FastAPI    → the router imports stream_response() and uses it
                           inside a StreamingResponse
  - Parse user input      → routers handle request validation

SSE format (what React receives):
  data: {"type": "chunk", "content": "Hello"}\n\n
  data: {"type": "chunk", "content": " world"}\n\n
  data: {"type": "done", "content": ""}\n\n
  data: {"type": "error", "content": "Something went wrong"}\n\n

React reads the fetch stream, splits on \n\n, strips "data: ", parses JSON.
type=chunk  → append content to displayed text
type=done   → mark stream as complete, enable input again
type=error  → show error message, enable input again
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from enum import Enum

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate

from config import get_settings

logger = logging.getLogger(__name__)

# ── NVIDIA NIM config ─────────────────────────────────────────────────────────
NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NIM_MODEL    = "meta/llama-3.1-8b-instruct"


# ── Query modes ───────────────────────────────────────────────────────────────

class QueryMode(str, Enum):
    DISCOVER  = "discover"   # global search — broad pattern finding
    CONNECT   = "connect"    # local search  — relating new to existing
    CHALLENGE = "challenge"  # local search  — contradiction detection


# ── Prompt templates ──────────────────────────────────────────────────────────
# Each mode gets a distinct system prompt that frames the LLM's role.
# {context} is replaced with GraphRAG's search result text.
# {query} is replaced with the user's original question.
#
# Design rule: the system prompt tells the LLM WHO it is and HOW to reason.
# The human message tells it WHAT to answer.
# GraphRAG context is injected into the system prompt so the LLM treats it
# as authoritative background, not user input.

_PROMPTS: dict[QueryMode, str] = {

    QueryMode.DISCOVER: """\
You are a knowledge analyst helping a user discover patterns and themes across their personal knowledge base.

The user has saved articles, notes, and documents. GraphRAG and Neo4j have analyzed the knowledge graph and surfaced the following context:

--- KNOWLEDGE GRAPH INSIGHTS ---
{context}
--- END INSIGHTS ---

Your task:
- If specific knowledge graph insights or entities are present above, synthesize them into clear, actionable themes and reference actual concepts from the context.
- If no matching knowledge base entries exist in the context above, provide a comprehensive, insightful answer to the user's question using your general domain knowledge, and briefly mention at the beginning that no specific Second Brain documents matched the query.
- Surface non-obvious connections and structure your response in clear markdown sections.

Respond as a thoughtful analyst.""",

    QueryMode.CONNECT: """\
You are a knowledge connector helping a user understand how information relates to their knowledge base.

GraphRAG and Neo4j have found the following context:

--- RELEVANT KNOWLEDGE ---
{context}
--- END KNOWLEDGE ---

Your task:
- If relevant entities/relationships exist above, explain specifically how the user's question connects to them and highlight important relationships.
- If no relevant knowledge base entries exist in the context, directly answer the user's question with high-quality insights while noting that no specific Second Brain documents matched.
- Format your response cleanly in markdown.

Be direct and specific.""",

    QueryMode.CHALLENGE: """\
You are a devil's advocate and critical thinking partner. Your job is to surface contradictions, tensions, and weak assumptions.

GraphRAG and Neo4j have provided the following context:

--- CONTRADICTION CONTEXT ---
{context}
--- END CONTEXT ---

Your task:
- Analyze the user's question and context to surface tensions, implicit assumptions, or weak points.
- Format your response in markdown with a "Contradictions / Tensions" section and a "Questions to Consider" section.
- If no matching documents exist in the context, challenge common assumptions about the user's topic using general reasoning while noting no specific Second Brain context matched.

Be intellectually honest and rigorous.""",
}


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse_chunk(content: str) -> str:
    """Formats a text chunk as an SSE data line."""
    payload = json.dumps({"type": "chunk", "content": content})
    return f"data: {payload}\n\n"


def _sse_done() -> str:
    """Formats the stream completion signal."""
    payload = json.dumps({"type": "done", "content": ""})
    return f"data: {payload}\n\n"


def _sse_error(message: str) -> str:
    """Formats an error signal — React shows this as an error state."""
    payload = json.dumps({"type": "error", "content": message})
    return f"data: {payload}\n\n"


# ── LLM Service ───────────────────────────────────────────────────────────────

class LLMService:
    """
    Singleton service for LangChain + NVIDIA NIM streaming.

    Usage (from query router):
        from services.llm import llm_service, QueryMode

        # Inside a StreamingResponse:
        async def generate():
            async for chunk in llm_service.stream_response(
                query=query,
                context=graphrag_result.response,
                mode=QueryMode.DISCOVER,
            ):
                yield chunk

        return StreamingResponse(generate(), media_type="text/event-stream")
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        # Lazy-initialized — not created at import time so a bad API key
        # doesn't crash the app before it even starts serving requests.
        self._llm: ChatOpenAI | None = None

    def _get_llm(self) -> ChatOpenAI:
        """
        Lazily build the ChatOpenAI client on first use.
        This avoids crashing at import time if NVIDIA_API_KEY is invalid/placeholder.
        """
        if self._llm is None:
            self._llm = ChatOpenAI(
                api_key     = self._settings.nvidia_api_key,
                base_url    = NVIDIA_NIM_BASE_URL,
                model       = NVIDIA_NIM_MODEL,
                temperature = 0.0,
                max_tokens  = 1500,
                streaming   = True,
            )
        return self._llm

    async def stream_response(
        self,
        query:   str,
        context: str,
        mode:    QueryMode,
    ) -> AsyncGenerator[str, None]:
        """
        Streams the LLM response as SSE-formatted chunks.

        Args:
            query:   The user's original question.
            context: GraphRAG search result text (global or local search output).
            mode:    One of Discover / Connect / Challenge — selects the system prompt.

        Yields:
            SSE-formatted strings. Each yield is one chunk ready to send over HTTP.
            Always ends with a done or error event.

        Example usage in a FastAPI router:
            return StreamingResponse(
                llm_service.stream_response(query, context, mode),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        The X-Accel-Buffering: no header tells nginx/CloudFront not to buffer
        the stream — without this, the user sees nothing until the response completes.
        """
        system_prompt = _PROMPTS[mode].format(context=context, query=query)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=query),
        ]

        logger.info(
            "Starting LLM stream | mode=%s | query_len=%d | context_len=%d",
            mode.value, len(query), len(context),
        )

        token_count = 0
        try:
            async for chunk in self._get_llm().astream(messages):
                # chunk is an AIMessageChunk — .content is the text fragment
                text = chunk.content
                if text:
                    token_count += 1
                    yield _sse_chunk(text)

            logger.info(
                "LLM stream complete | mode=%s | chunks_yielded=%d",
                mode.value, token_count,
            )
            yield _sse_done()

        except Exception as e:
            # Log the full exception for CloudWatch, send a clean message to React
            logger.exception(
                "LLM streaming failed | mode=%s | query=%r", mode.value, query
            )
            yield _sse_error(f"Generation failed: {type(e).__name__}. Please try again.")

    async def generate_title(self, text: str) -> str:
        """
        Non-streaming call — generates a short document title from the first
        500 chars of a document. Used by the ingest router to auto-name documents.

        Returns a plain string (not SSE).
        """
        prompt = (
            "Generate a concise title (5 words max) for the following text. "
            "Return only the title, nothing else.\n\n"
            f"{text[:500]}"
        )
        try:
            response = await self._get_llm().ainvoke([HumanMessage(content=prompt)])
            title = response.content.strip().strip('"').strip("'")
            logger.info("Generated title: %r", title)
            return title
        except Exception:
            logger.exception("Title generation failed")
            return "Untitled Document"


# ── Singleton export ──────────────────────────────────────────────────────────

llm_service = LLMService()