import logging
from neo4j import GraphDatabase
from neo4j.exceptions import ServiceUnavailable, AuthError
from config import settings

logger = logging.getLogger(__name__)


class Neo4jClient:
    """
    Single responsibility: all Neo4j operations live here.
    No router or service ever writes Cypher directly.
    One instance shared across the entire app (singleton).
    """

    def __init__(self):
        """
        This constructor create neo4j driver
        verify the connection and fail when databse inunvauale for debugging
        """
        try:
            self.driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_username, settings.neo4j_password),
                notifications_min_severity="OFF", 
            )
            self.driver.verify_connectivity()
            logger.info("Neo4j connected successfully")
        except AuthError:
            logger.error("Neo4j authentication failed — check NEO4J_USERNAME and NEO4J_PASSWORD")
            raise
        except ServiceUnavailable:
            logger.error("Neo4j unreachable — check NEO4J_URI")
            raise

    def close(self):
        self.driver.close()
        logger.info("Neo4j driver closed")

    # ── Documents ──────────────────────────────────────────────────

    def save_document(self, doc_id: str, title: str, source_type: str, raw_text: str):
        """
        MERGE — not CREATE. Same document uploaded twice
        updates it instead of creating a duplicate node.
        """
        with self.driver.session() as session:
            session.run(
                """
                MERGE (d:Document {id: $id})
                SET d.title       = $title,
                    d.source_type = $source_type,
                    d.raw_text    = $raw_text,
                    d.indexed     = false,
                    d.created_at  = datetime()
                """,
                id=doc_id,
                title=title,
                source_type=source_type,
                raw_text=raw_text,
            )
            logger.info(f"Document saved: {doc_id}")

    def mark_document_indexed(self, doc_id: str):
        """Called by Lambda after GraphRAG finishes indexing."""
        with self.driver.session() as session:
            session.run(
                """
                MATCH (d:Document {id: $id})
                SET d.indexed    = true,
                    d.indexed_at = datetime()
                """,
                id=doc_id,
            )
            logger.info(f"Document marked indexed: {doc_id}")

    def mark_document_failed(self, doc_id: str, error: str):
        """Called by Lambda if GraphRAG indexing fails."""
        with self.driver.session() as session:
            session.run(
                """
                MATCH (d:Document {id: $id})
                SET d.indexed = false,
                    d.error   = $error,
                    d.failed  = true
                """,
                id=doc_id,
                error=error,
            )
            logger.error(f"Document marked failed: {doc_id} — {error}")

    def get_document_status(self, doc_id: str) -> dict | None:
        """Used by /ingest/status polling endpoint."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (d:Document {id: $id})
                RETURN d.id         AS id,
                       d.title      AS title,
                       d.indexed    AS indexed,
                       d.failed     AS failed,
                       d.error      AS error,
                       d.created_at AS created_at,
                       d.indexed_at AS indexed_at
                """,
                id=doc_id,
            )
            record = result.single()
            return dict(record) if record else None

    def get_all_documents(self) -> list[dict]:
        """Returns all documents for the sidebar list in frontend."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (d:Document)
                RETURN d.id          AS id,
                       d.title       AS title,
                       d.source_type AS source_type,
                       d.indexed     AS indexed,
                       d.failed      AS failed,
                       d.created_at  AS created_at
                ORDER BY d.created_at DESC
                """
            )
            return [dict(r) for r in result]

    def delete_document(self, doc_id: str):
        """
        Deletes document and ALL its related entities.
        DETACH DELETE removes the node AND all its relationships.
        """
        with self.driver.session() as session:
            session.run(
                """
                MATCH (d:Document {id: $id})
                OPTIONAL MATCH (d)-[:CONTAINS]->(e:Entity)
                DETACH DELETE d, e
                """,
                id=doc_id,
            )
            logger.info(f"Document deleted: {doc_id}")

    # ── Entities ───────────────────────────────────────────────────

    def save_entity(
        self,
        entity_id: str,
        name: str,
        entity_type: str,
        description: str,
        doc_id: str,
    ):
        """
        MERGE on entity id — same entity appearing in multiple
        documents gets ONE node, linked to multiple documents.
        This is the core of GraphRAG — shared entities create
        cross-document connections automatically.
        """
        with self.driver.session() as session:
            session.run(
                """
                MERGE (e:Entity {id: $id})
                SET e.name        = $name,
                    e.type        = $type,
                    e.description = $description
                WITH e
                MATCH (d:Document {id: $doc_id})
                MERGE (d)-[:CONTAINS]->(e)
                """,
                id=entity_id,
                name=name,
                type=entity_type,
                description=description,
                doc_id=doc_id,
            )

    def save_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        description: str,
    ):
        """Saves a relationship between two entities extracted by GraphRAG."""
        with self.driver.session() as session:
            session.run(
                """
                MATCH (a:Entity {id: $source_id})
                MATCH (b:Entity {id: $target_id})
                MERGE (a)-[r:RELATES_TO {type: $rel_type}]->(b)
                SET r.description = $description
                """,
                source_id=source_id,
                target_id=target_id,
                rel_type=rel_type,
                description=description,
            )

    # ── Graph data for Cytoscape.js ────────────────────────────────

    def get_full_graph(self) -> dict:
        """
        Returns all nodes + edges formatted for Cytoscape.js.
        Cytoscape expects: {"nodes": [{"data": {...}}], "edges": [{"data": {...}}]}
        """
        with self.driver.session() as session:
            nodes_result = session.run(
                """
                MATCH (e:Entity)
                RETURN e.id          AS id,
                       e.name        AS name,
                       e.type        AS type,
                       e.description AS description
                LIMIT 200
                """
            )
            edges_result = session.run(
                """
                MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                RETURN a.id       AS source,
                       b.id       AS target,
                       r.type     AS rel_type,
                       r.description AS description
                LIMIT 400
                """
            )
            return {
                "nodes": [{"data": dict(r)} for r in nodes_result],
                "edges": [{"data": dict(r)} for r in edges_result],
            }

    def get_relevant_subgraph(self, entity_names: list[str]) -> dict:
        """
        Returns subgraph around specific entities.
        Used to highlight relevant nodes in Cytoscape.js
        after a user query.
        """
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (e:Entity)
                WHERE e.name IN $names
                OPTIONAL MATCH (e)-[r:RELATES_TO]-(connected:Entity)
                RETURN e, r, connected
                LIMIT 100
                """,
                names=entity_names,
            )
            nodes, edges = {}, []
            for record in result:
                e = record["e"]
                nodes[e["id"]] = {
                    "data": {"id": e["id"], "name": e["name"], "type": e["type"]}
                }
                if record["connected"] and record["r"]:
                    c = record["connected"]
                    nodes[c["id"]] = {
                        "data": {"id": c["id"], "name": c["name"], "type": c["type"]}
                    }
                    edges.append({"data": {
                        "source": e["id"],
                        "target": c["id"],
                        "rel_type": record["r"].type,
                    }})
            return {"nodes": list(nodes.values()), "edges": edges}

    # ── Search ─────────────────────────────────────────────────────

    def search_entities(self, query: str) -> list[dict]:
        """Full-text search across entity names and descriptions."""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (e:Entity)
                WHERE toLower(e.name)        CONTAINS toLower($query)
                   OR toLower(e.description) CONTAINS toLower($query)
                RETURN e.id          AS id,
                       e.name        AS name,
                       e.type        AS type,
                       e.description AS description
                LIMIT 20
                """,
                query=query,
            )
            return [dict(r) for r in result]


# ── Singleton ──────────────────────────────────────────────────────
# Created once when this module is first imported.
# Every router imports this object — never instantiates Neo4jClient directly.
neo4j_client = Neo4jClient()