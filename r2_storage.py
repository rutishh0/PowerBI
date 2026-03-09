"""
Cloudflare R2 Storage Module
=============================
Handles file upload, download, listing, and deletion from R2 Object Storage.
Uses boto3 S3-compatible API.
"""

import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

load_dotenv()

# R2 Configuration
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "power")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")

# Singleton client
_s3_client = None


def get_r2_client():
    """Get or create the R2 S3 client."""
    global _s3_client
    if _s3_client is None:
        if not R2_ENDPOINT_URL or not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
            print("R2 credentials not configured in .env")
            return None
        _s3_client = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "adaptive"},
            ),
            region_name="auto",
        )
        print("R2 client initialized successfully.")
    return _s3_client


def upload_to_r2(file_bytes, original_filename):
    """Upload file bytes to R2. Returns dict with r2_key and public_url, or None on failure."""
    client = get_r2_client()
    if not client:
        return None

    # Generate unique key: uploads/YYYY-MM/uuid_originalname
    now = datetime.now()
    prefix = now.strftime("uploads/%Y-%m")
    unique_id = uuid.uuid4().hex[:12]
    # Sanitize filename
    safe_name = original_filename.replace(" ", "_").replace("/", "_").replace("\\", "_")
    r2_key = f"{prefix}/{unique_id}_{safe_name}"

    try:
        client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=r2_key,
            Body=file_bytes,
            ContentLength=len(file_bytes),
        )
        public_url = f"{R2_PUBLIC_URL}/{r2_key}" if R2_PUBLIC_URL else None
        print(f"Uploaded to R2: {r2_key} ({len(file_bytes)} bytes)")
        return {
            "r2_key": r2_key,
            "public_url": public_url,
            "file_size": len(file_bytes),
        }
    except ClientError as e:
        print(f"R2 upload error: {e}")
        return None


def download_from_r2(r2_key):
    """Download file bytes from R2 by key. Returns bytes or None."""
    client = get_r2_client()
    if not client:
        return None

    try:
        response = client.get_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        return response["Body"].read()
    except ClientError as e:
        print(f"R2 download error for {r2_key}: {e}")
        return None


def delete_from_r2(r2_key):
    """Delete a file from R2 by key. Returns True on success."""
    client = get_r2_client()
    if not client:
        return False

    try:
        client.delete_object(Bucket=R2_BUCKET_NAME, Key=r2_key)
        print(f"Deleted from R2: {r2_key}")
        return True
    except ClientError as e:
        print(f"R2 delete error for {r2_key}: {e}")
        return False


def list_r2_objects(prefix="uploads/", max_keys=100):
    """List objects in R2 bucket. Returns list of dicts."""
    client = get_r2_client()
    if not client:
        return []

    try:
        response = client.list_objects_v2(
            Bucket=R2_BUCKET_NAME, Prefix=prefix, MaxKeys=max_keys
        )
        objects = []
        for obj in response.get("Contents", []):
            objects.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
            })
        return objects
    except ClientError as e:
        print(f"R2 list error: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# S3 MULTIPART UPLOAD (streams chunks directly to R2, no reassembly)
# ─────────────────────────────────────────────────────────────

def generate_r2_key(original_filename):
    """Generate a unique R2 key for a file."""
    now = datetime.now()
    prefix = now.strftime("uploads/%Y-%m")
    unique_id = uuid.uuid4().hex[:12]
    safe_name = original_filename.replace(" ", "_").replace("/", "_").replace("\\", "_")
    return f"{prefix}/{unique_id}_{safe_name}"


def create_multipart_upload(r2_key):
    """Start a multipart upload on R2. Returns the UploadId or None."""
    client = get_r2_client()
    if not client:
        return None

    try:
        response = client.create_multipart_upload(Bucket=R2_BUCKET_NAME, Key=r2_key)
        upload_id = response["UploadId"]
        print(f"Multipart upload started: {r2_key} (UploadId={upload_id[:16]}...)")
        return upload_id
    except ClientError as e:
        print(f"R2 create_multipart_upload error: {e}")
        return None


def upload_part(r2_key, upload_id, part_number, part_bytes):
    """Upload a single part. Returns ETag or None."""
    client = get_r2_client()
    if not client:
        return None

    try:
        response = client.upload_part(
            Bucket=R2_BUCKET_NAME,
            Key=r2_key,
            UploadId=upload_id,
            PartNumber=part_number,
            Body=part_bytes,
        )
        etag = response["ETag"]
        print(f"  Part {part_number} uploaded ({len(part_bytes)} bytes, ETag={etag})")
        return etag
    except ClientError as e:
        print(f"R2 upload_part error (part {part_number}): {e}")
        return None


def complete_multipart_upload(r2_key, upload_id, parts):
    """Complete multipart upload. parts = [{"PartNumber": int, "ETag": str}, ...]"""
    client = get_r2_client()
    if not client:
        return False

    try:
        client.complete_multipart_upload(
            Bucket=R2_BUCKET_NAME,
            Key=r2_key,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )
        print(f"Multipart upload completed: {r2_key} ({len(parts)} parts)")
        return True
    except ClientError as e:
        print(f"R2 complete_multipart_upload error: {e}")
        return False


def abort_multipart_upload(r2_key, upload_id):
    """Abort a multipart upload (cleanup on failure)."""
    client = get_r2_client()
    if not client:
        return

    try:
        client.abort_multipart_upload(
            Bucket=R2_BUCKET_NAME, Key=r2_key, UploadId=upload_id
        )
        print(f"Multipart upload aborted: {r2_key}")
    except ClientError as e:
        print(f"R2 abort_multipart_upload error: {e}")
