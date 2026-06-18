import json
import logging
import uuid
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

from config import settings

logger = logging.getLogger(__name__)

# Single boto3 SQS client — reused across all requests
_sqs_client = None


def get_sqs_client():
    global _sqs_client
    if _sqs_client is None:
        _sqs_client = boto3.client(
            "sqs",
            region_name=settings.AWS_REGION,
            config=Config(retries={"max_attempts": 3, "mode": "standard"}),
        )
    return _sqs_client


async def enqueue_job(doc_id: str, s3_key: str, filename: str) -> str:
    """
    Put an indexing job onto the SQS queue.

    Called by the ingest router immediately after uploading to S3.
    FastAPI returns job_id to the user right away — no waiting for GraphRAG.
    Lambda picks up this message and runs the actual indexing.

    Message format (what Lambda receives):
        {
            "job_id": "uuid4",
            "doc_id": "uuid4",       ← Neo4j document node ID
            "s3_key": "docs/abc.pdf", ← where to fetch the file from
            "filename": "research.pdf"
        }

    Why include filename? Lambda logs and Neo4j node titles need it — S3 keys
    are opaque UUIDs, not human-readable names.

    Args:
        doc_id: the document ID already saved to Neo4j (status=pending)
        s3_key: S3 object key returned by s3.upload_file()
        filename: original filename from the upload

    Returns:
        job_id — a fresh UUID the frontend polls against /ingest/status/{job_id}

    Raises:
        RuntimeError: if the SQS send fails.
    """
    job_id = str(uuid.uuid4())

    message_body = json.dumps({
        "job_id": job_id,
        "doc_id": doc_id,
        "s3_key": s3_key,
        "filename": filename,
    })

    try:
        response = get_sqs_client().send_message(
            QueueUrl=settings.SQS_QUEUE_URL,
            MessageBody=message_body,
            # MessageDeduplicationId not needed — Standard queue (not FIFO)
        )
        message_id = response.get("MessageId", "unknown")
        logger.info(f"Enqueued job {job_id} (doc={doc_id}, sqs_message={message_id})")
        return job_id

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        logger.error(f"SQS enqueue failed [{error_code}] for doc '{doc_id}': {e}", exc_info=True)
        raise RuntimeError(f"Failed to queue indexing job: {error_code}") from e


def parse_message(sqs_event: dict) -> list[dict]:
    """
    Parse the raw SQS event that Lambda receives and return a clean list of jobs.

    Lambda gets batches — SQS can deliver 1–10 messages at once depending on
    batch size config. We iterate all of them so one invocation can handle
    multiple queued jobs.

    Expected Lambda event structure:
        {
            "Records": [
                {
                    "messageId": "...",
                    "body": "{\"job_id\": \"...\", \"doc_id\": \"...\", ...}",
                    ...
                }
            ]
        }

    Args:
        sqs_event: the raw event dict Lambda receives from SQS trigger

    Returns:
        List of parsed job dicts, one per SQS record.
        Each dict has: job_id, doc_id, s3_key, filename

    Raises:
        ValueError: if a record's body is malformed JSON or missing required fields.
    """
    jobs = []
    records = sqs_event.get("Records", [])

    for record in records:
        message_id = record.get("messageId", "unknown")

        try:
            body = json.loads(record["body"])
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to parse SQS message body (messageId={message_id}): {e}")
            raise ValueError(f"Malformed SQS message body: {message_id}") from e

        # Validate required fields — fail fast rather than silently skip
        required = {"job_id", "doc_id", "s3_key", "filename"}
        missing = required - body.keys()
        if missing:
            logger.error(f"SQS message {message_id} missing fields: {missing}")
            raise ValueError(f"SQS message missing required fields: {missing}")

        logger.info(f"Parsed SQS message {message_id} → job={body['job_id']}, doc={body['doc_id']}")
        jobs.append(body)

    return jobs
