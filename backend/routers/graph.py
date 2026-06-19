import logging

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from services.neo4j_client import neo4j_client

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Request schema ────────────────────────────────────────────────────────────

class SubgraphRequest(BaseModel):
    entity_names: list[str]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/full")
async def get_full_graph():
    """
    Returns all Entity nodes and RELATES_TO edges from Neo4j.
    Formatted for Cytoscape.js:
        {"nodes": [{"data": {...}}], "edges": [{"data": {...}}]}

    Limits: 200 nodes, 400 edges — set in neo4j_client.get_full_graph().
    Large graphs beyond this get slow in the browser regardless of the backend.
    """
    try:
        graph = neo4j_client.get_full_graph()
        logger.info(
            f"Full graph fetched | nodes={len(graph['nodes'])} edges={len(graph['edges'])}"
        )
        return graph
    except Exception as e:
        logger.error(f"Failed to fetch full graph: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve knowledge graph",
        )


@router.post("/subgraph")
async def get_subgraph(request: SubgraphRequest):
    """
    Returns a subgraph centered on the given entity names.
    Used to highlight relevant nodes in Cytoscape.js after a user query.

    Frontend calls this after a /api/query response — passes the entity names
    mentioned in the answer to visually highlight them on the graph.

    Why POST not GET?
    entity_names is a list — passing arrays in GET query params is messy.
    POST with a JSON body is cleaner and has no URL length limits.
    """
    if not request.entity_names:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="entity_names cannot be empty",
        )

    if len(request.entity_names) > 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Too many entity names — max 50 per request",
        )

    try:
        subgraph = neo4j_client.get_relevant_subgraph(request.entity_names)
        logger.info(
            f"Subgraph fetched | entities={len(request.entity_names)} "
            f"nodes={len(subgraph['nodes'])} edges={len(subgraph['edges'])}"
        )
        return subgraph
    except Exception as e:
        logger.error(f"Failed to fetch subgraph: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve subgraph",
        )


@router.get("/search")
async def search_entities(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
):
    """
    Full-text search across entity names and descriptions.
    Used by the frontend search bar to find specific concepts in the graph.

    Returns up to 20 matching entities — limit set in neo4j_client.search_entities().

    Why a GET with query param here but POST for subgraph?
    Search is a read operation with a single string — perfect for GET + query param.
    It's also bookmarkable and cacheable. Subgraph takes an array — POST is cleaner.
    """
    try:
        entities = neo4j_client.search_entities(q)
        logger.info(f"Entity search | query='{q}' | results={len(entities)}")
        return {
            "query": q,
            "results": entities,
            "total": len(entities),
        }
    except Exception as e:
        logger.error(f"Entity search failed for query '{q}': {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Entity search failed",
        )