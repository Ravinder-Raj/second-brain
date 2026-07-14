import asyncio
import logging
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

from config import settings

logger = logging.getLogger(__name__)

# Single boto3 client shared across the app (thread-safe, reuses connections)
_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            region_name=settings.aws_region,
            config=Config(
                retries={"max_attempts": 3, "mode": "standard"},
                signature_version="s3v4",  # required for presigned URLs in all regions
            ),
        )
    return _s3_client


async def upload_file(file_bytes: bytes, s3_key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload raw bytes to S3.

    Args:
        file_bytes: raw file content
        s3_key: destination path inside the uploads bucket, e.g. "docs/abc123.pdf"
        content_type: MIME type — stored as object metadata so browsers handle downloads correctly

    Returns:
        The s3_key on success (caller uses it to reference the file later).

    Raises:
        RuntimeError: if the upload fails after retries.
    """
    try:
        # Run sync boto3 in a thread to avoid blocking the async event loop.
        # Without this, health checks and other requests stall during uploads.
        await asyncio.to_thread(
            get_s3_client().put_object,
            Bucket=settings.s3_bucket_uploads,
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type,
        )
        logger.info(f"Uploaded {len(file_bytes)} bytes → s3://{settings.s3_bucket_uploads}/{s3_key}")
        return s3_key

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        logger.error(f"S3 upload failed [{error_code}] for key '{s3_key}': {e}", exc_info=True)
        raise RuntimeError(f"S3 upload failed: {error_code}") from e


async def get_file(s3_key: str) -> bytes:
    """
    Download a file from S3 and return raw bytes.

    This is used by the Lambda indexer — it pulls the uploaded PDF/text
    from S3, passes it to GraphRAG for extraction.

    Args:
        s3_key: the S3 object key (same value returned by upload_file)

    Returns:
        File contents as bytes.

    Raises:
        FileNotFoundError: if the key doesn't exist.
        RuntimeError: for other S3 errors.
    """
    try:
        # Run sync boto3 in a thread to avoid blocking the async event loop
        response = await asyncio.to_thread(
            get_s3_client().get_object,
            Bucket=settings.s3_bucket_uploads,
            Key=s3_key,
        )
        file_bytes = response["Body"].read()
        logger.info(f"Downloaded {len(file_bytes)} bytes ← s3://{settings.s3_bucket_uploads}/{s3_key}")
        return file_bytes

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "NoSuchKey":
            logger.error(f"S3 key not found: '{s3_key}'")
            raise FileNotFoundError(f"File not found in S3: {s3_key}") from e
        logger.error(f"S3 get failed [{error_code}] for key '{s3_key}': {e}", exc_info=True)
        raise RuntimeError(f"S3 download failed: {error_code}") from e


def generate_presigned_url(s3_key: str, expiry_seconds: int = 3600) -> str:
    """
    Generate a time-limited presigned URL for direct browser download.

    Why presigned URLs instead of proxying through FastAPI?
    - FastAPI never touches the file bytes → no memory pressure on the container
    - S3 serves the file directly to the user at full bandwidth
    - URL expires automatically, no auth logic needed in the app

    Args:
        s3_key: the S3 object key
        expiry_seconds: how long the URL stays valid (default 1 hour)

    Returns:
        HTTPS URL the client can use to download the file directly from S3.

    Raises:
        RuntimeError: if URL generation fails.
    """
    try:
        url = get_s3_client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.s3_bucket_uploads,
                "Key": s3_key,
            },
            ExpiresIn=expiry_seconds,
        )
        logger.info(f"Generated presigned URL for '{s3_key}' (expires in {expiry_seconds}s)")
        return url

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        logger.error(f"Failed to generate presigned URL [{error_code}] for '{s3_key}': {e}", exc_info=True)
        raise RuntimeError(f"Presigned URL generation failed: {error_code}") from e
