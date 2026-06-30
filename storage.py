"""
Unified Storage Module
======================
Consolidates Postgres metadata persistence (formerly db.py) and Cloudflare R2
object storage access (formerly r2_storage.py) into a single module.

Postgres:
    - ThreadedConnectionPool (min=1, max=20) backed by DATABASE_URL
    - Tables: file_uploads (BYTEA storage), r2_file_uploads (R2 metadata)

R2:
    - boto3 S3-compatible client (singleton)
    - Multipart upload helpers for streaming large files
"""

import os
import re
import uuid
from datetime import datetime

import psycopg2
import psycopg2.extras
from psycopg2 import Error
from psycopg2.pool import ThreadedConnectionPool

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────
# ENVIRONMENT / SHARED CLIENTS
# ─────────────────────────────────────────────────────────────

load_dotenv()

# R2 Configuration (read once at import time — mirrors prior behavior)
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "power")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")


# ─────────────────────────────────────────────────────────────
# POSTGRES — CONNECTION POOL
# ─────────────────────────────────────────────────────────────

# Global connection pool
db_pool = None


def init_connection_pool():
    """Initialize the database connection pool."""
    global db_pool
    if db_pool is None:
        try:
            url = os.getenv("DATABASE_URL")
            if not url:
                print("DATABASE_URL not found in environment variables.")
                return None

            # Create a pool with min 1 and max 20 connections
            db_pool = ThreadedConnectionPool(1, 20, url)
            print("Database connection pool created successfully.")
        except Error as e:
            print(f"Error creating connection pool: {e}")
            db_pool = None


def get_db_connection():
    """Get a connection from the pool."""
    global db_pool
    if db_pool is None:
        init_connection_pool()

    try:
        if db_pool:
            return db_pool.getconn()
        return None
    except Error as e:
        print(f"Error getting connection from pool: {e}")
        return None


def return_db_connection(connection):
    """Return a connection to the pool."""
    global db_pool
    if db_pool and connection:
        db_pool.putconn(connection)


def init_db():
    """Initialize the database tables if they don't exist."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor()
            # PostgreSQL syntax: SERIAL for auto-increment, BYTEA for binary
            create_table_query = """
            CREATE TABLE IF NOT EXISTS file_uploads (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                file_data BYTEA NOT NULL,
                file_size INT,
                session_id VARCHAR(64)
            );
            """
            cursor.execute(create_table_query)

            # R2 file metadata table (no BYTEA — files live in R2)
            create_r2_table = """
            CREATE TABLE IF NOT EXISTS r2_file_uploads (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                r2_key VARCHAR(512) NOT NULL,
                public_url TEXT,
                file_size BIGINT,
                upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                session_id VARCHAR(64)
            );
            """
            cursor.execute(create_r2_table)

            # Generic key→JSON store (used by the holidays editor, etc.)
            create_kv_table = """
            CREATE TABLE IF NOT EXISTS app_kv (
                key VARCHAR(128) PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
            cursor.execute(create_kv_table)

            connection.commit()
            print("Database initialized successfully (file_uploads + r2_file_uploads + app_kv).")
        except Error as e:
            print(f"Error initializing database: {e}")
        finally:
            return_db_connection(connection)
    else:
        print("Failed to connect to database during initialization.")


# ─────────────────────────────────────────────────────────────
# POSTGRES — generic key→JSON store (app_kv)
# ─────────────────────────────────────────────────────────────

def kv_get(key):
    """Return the stored string value for ``key`` (or None if absent / DB down)."""
    connection = get_db_connection()
    if not connection:
        return None
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT value FROM app_kv WHERE key = %s", (key,))
        row = cursor.fetchone()
        return row[0] if row else None
    except Error as e:
        print(f"kv_get error for '{key}': {e}")
        return None
    finally:
        return_db_connection(connection)


def kv_set(key, value):
    """Upsert ``key`` → ``value`` (a string). Returns True on success."""
    connection = get_db_connection()
    if not connection:
        return False
    try:
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO app_kv (key, value, updated_at) VALUES (%s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
            """,
            (key, value),
        )
        connection.commit()
        return True
    except Error as e:
        print(f"kv_set error for '{key}': {e}")
        return False
    finally:
        return_db_connection(connection)


# ─────────────────────────────────────────────────────────────
# POSTGRES — file_uploads CRUD (BYTEA blob storage)
# ─────────────────────────────────────────────────────────────

def save_file_to_db(filename, file_bytes, session_id=None):
    """Save a file to the database."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor()
            query = """
            INSERT INTO file_uploads (filename, file_data, file_size, session_id, upload_date)
            VALUES (%s, %s, %s, %s, %s)
            """
            file_size = len(file_bytes)
            cursor.execute(query, (filename, file_bytes, file_size, session_id, datetime.now()))
            connection.commit()
            print(f"File '{filename}' saved to database successfully.")
            return True
        except Error as e:
            print(f"Error saving file to database: {e}")
            return False
        finally:
            return_db_connection(connection)
    return False


def get_all_files():
    """Retrieve all files metadata from the database."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            query = "SELECT id, filename, upload_date, file_size FROM file_uploads ORDER BY upload_date DESC"
            cursor.execute(query)
            files = cursor.fetchall()
            for f in files:
                if isinstance(f['upload_date'], datetime):
                    f['upload_date'] = f['upload_date'].isoformat()
            return files
        except Error as e:
            print(f"Error fetching files: {e}")
            return []
        finally:
            return_db_connection(connection)
    return []


def get_file_by_id(file_id):
    """Retrieve a specific file's data by ID."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            query = "SELECT filename, file_data FROM file_uploads WHERE id = %s"
            cursor.execute(query, (file_id,))
            file_record = cursor.fetchone()
            return file_record
        except Error as e:
            print(f"Error fetching file {file_id}: {e}")
            return None
        finally:
            return_db_connection(connection)
    return None


def delete_file_by_id(file_id):
    """Delete a specific file by ID."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor()
            query = "DELETE FROM file_uploads WHERE id = %s"
            cursor.execute(query, (file_id,))
            connection.commit()
            return cursor.rowcount > 0
        except Error as e:
            print(f"Error deleting file {file_id}: {e}")
            return False
        finally:
            return_db_connection(connection)
    return False


# ─────────────────────────────────────────────────────────────
# POSTGRES — r2_file_uploads CRUD (R2 metadata; files stored in R2)
# ─────────────────────────────────────────────────────────────

def save_r2_file_metadata(filename, r2_key, public_url, file_size, session_id=None):
    """Save R2 file metadata to the database."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor()
            query = """
            INSERT INTO r2_file_uploads (filename, r2_key, public_url, file_size, session_id, upload_date)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
            """
            cursor.execute(query, (filename, r2_key, public_url, file_size, session_id, datetime.now()))
            row_id = cursor.fetchone()[0]
            connection.commit()
            print(f"R2 metadata for '{filename}' saved (id={row_id}).")
            return row_id
        except Error as e:
            print(f"Error saving R2 metadata: {e}")
            return None
        finally:
            return_db_connection(connection)
    return None


def get_all_r2_files():
    """Retrieve all R2 file metadata."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            query = "SELECT id, filename, r2_key, public_url, file_size, upload_date FROM r2_file_uploads ORDER BY upload_date DESC"
            cursor.execute(query)
            files = cursor.fetchall()
            for f in files:
                if isinstance(f['upload_date'], datetime):
                    f['upload_date'] = f['upload_date'].isoformat()
            return files
        except Error as e:
            print(f"Error fetching R2 files: {e}")
            return []
        finally:
            return_db_connection(connection)
    return []


def get_r2_file_by_id(file_id):
    """Retrieve R2 file metadata by ID."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            query = "SELECT id, filename, r2_key, public_url, file_size FROM r2_file_uploads WHERE id = %s"
            cursor.execute(query, (file_id,))
            return cursor.fetchone()
        except Error as e:
            print(f"Error fetching R2 file {file_id}: {e}")
            return None
        finally:
            return_db_connection(connection)
    return None


def delete_r2_metadata_by_key(r2_key):
    """Best-effort delete of the metadata row(s) for an r2_key. No-op (and never
    raises) when the DB is unavailable — the R2 object delete is the real action."""
    connection = get_db_connection()
    if not connection:
        return
    try:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM r2_file_uploads WHERE r2_key = %s", (r2_key,))
        connection.commit()
    except Error as e:
        print(f"Error deleting R2 metadata by key: {e}")
    finally:
        return_db_connection(connection)


def delete_r2_file_by_id(file_id):
    """Delete R2 file metadata by ID. Returns the r2_key so caller can delete from R2."""
    connection = get_db_connection()
    if connection:
        try:
            cursor = connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            # First get the r2_key
            cursor.execute("SELECT r2_key FROM r2_file_uploads WHERE id = %s", (file_id,))
            row = cursor.fetchone()
            if not row:
                return None
            r2_key = row['r2_key']
            # Delete metadata
            cursor.execute("DELETE FROM r2_file_uploads WHERE id = %s", (file_id,))
            connection.commit()
            return r2_key
        except Error as e:
            print(f"Error deleting R2 file {file_id}: {e}")
            return None
        finally:
            return_db_connection(connection)
    return None


# ─────────────────────────────────────────────────────────────
# CLOUDFLARE R2 — CLIENT (singleton)
# ─────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────
# CLOUDFLARE R2 — SIMPLE OPS (download / delete)
# ─────────────────────────────────────────────────────────────

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


def r2_get_text(key):
    """Read a small text/JSON object from R2 by key. Returns str or None
    (None also when the key doesn't exist yet — that's normal)."""
    client = get_r2_client()
    if not client:
        return None
    try:
        r = client.get_object(Bucket=R2_BUCKET_NAME, Key=key)
        return r["Body"].read().decode("utf-8")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code not in ("NoSuchKey", "404", "NoSuchBucket"):
            print(f"R2 get_text error for {key}: {e}")
        return None
    except Exception as e:
        print(f"R2 get_text error for {key}: {e}")
        return None


def r2_put_text(key, text, content_type="application/json"):
    """Write a small text/JSON object to R2 under key. Returns True on success."""
    client = get_r2_client()
    if not client:
        return False
    try:
        client.put_object(Bucket=R2_BUCKET_NAME, Key=key,
                          Body=text.encode("utf-8"), ContentType=content_type)
        return True
    except Exception as e:
        print(f"R2 put_text error for {key}: {e}")
        return False


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


# ─────────────────────────────────────────────────────────────
# CLOUDFLARE R2 — MULTIPART UPLOAD (streams chunks directly, no reassembly)
# ─────────────────────────────────────────────────────────────

def generate_r2_key(original_filename):
    """Generate a unique R2 key for a file."""
    now = datetime.now()
    prefix = now.strftime("uploads/%Y-%m")
    unique_id = uuid.uuid4().hex[:12]
    safe_name = original_filename.replace(" ", "_").replace("/", "_").replace("\\", "_")
    return f"{prefix}/{unique_id}_{safe_name}"


def _filename_from_key(key):
    """Recover the original filename from an R2 key, stripping the
    ``<12-hex>_`` uniqueness prefix that ``generate_r2_key`` prepends."""
    base = key.rsplit("/", 1)[-1]
    m = re.match(r"^[0-9a-f]{12}_(.+)$", base)
    return m.group(1) if m else base


def list_r2_objects(prefix="uploads/"):
    """List objects in the R2 bucket directly (no database involved).

    This is the source of truth for the file archive: it works whenever R2
    credentials are configured, independent of the Postgres metadata table
    (which may be empty or unreachable). Returns newest-first dicts shaped like
    the DB metadata rows so callers can treat them interchangeably.
    """
    client = get_r2_client()
    if not client:
        return []
    out = []
    try:
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=R2_BUCKET_NAME, Prefix=prefix):
            for obj in (page.get("Contents") or []):
                key = obj["Key"]
                if key.endswith("/") or obj.get("Size", 0) == 0:
                    continue  # skip folder placeholders
                lm = obj.get("LastModified")
                out.append({
                    "id": None,                       # no DB row — act by r2_key
                    "r2_key": key,
                    "filename": _filename_from_key(key),
                    "public_url": f"{R2_PUBLIC_URL}/{key}" if R2_PUBLIC_URL else None,
                    "file_size": obj.get("Size", 0),
                    "upload_date": lm.isoformat() if lm else None,
                })
        out.sort(key=lambda f: f["upload_date"] or "", reverse=True)
    except Exception as e:
        print(f"R2 list error: {e}")
    return out


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
