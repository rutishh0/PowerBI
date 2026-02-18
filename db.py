import os
import psycopg2
import psycopg2.extras
from psycopg2 import Error
from psycopg2.pool import ThreadedConnectionPool
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

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
    """Initialize the database table if it doesn't exist."""
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
            connection.commit()
            print("Database initialized successfully.")
        except Error as e:
            print(f"Error initializing database: {e}")
        finally:
            return_db_connection(connection)
    else:
        print("Failed to connect to database during initialization.")

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
