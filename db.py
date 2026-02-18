import os
import psycopg2
import psycopg2.extras
from psycopg2 import Error
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def get_db_connection():
    """Create a database connection."""
    try:
        # Connect using the DATABASE_URL
        url = os.getenv("DATABASE_URL")
        if not url:
            print("DATABASE_URL not found in environment variables.")
            return None
            
        connection = psycopg2.connect(url)
        return connection
    except Error as e:
        print(f"Error connecting to PostgreSQL: {e}")
        return None

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
            if connection:
                cursor.close()
                connection.close()
    else:
        print("Failed to connect to database during initialization.")

def save_file_to_db(filename, file_bytes, session_id):
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
            # psycopg2 handles bytea automatically when passed bytes
            cursor.execute(query, (filename, file_bytes, file_size, session_id, datetime.now()))
            connection.commit()
            print(f"File '{filename}' saved to database successfully.")
            return True
        except Error as e:
            print(f"Error saving file to database: {e}")
            return False
        finally:
            if connection:
                cursor.close()
                connection.close()
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
            # Convert datetime objects to string for JSON serialization if needed, 
            # though Flask's jsonify might need help or we convert here.
            for f in files:
                if isinstance(f['upload_date'], datetime):
                    f['upload_date'] = f['upload_date'].isoformat()
            return files
        except Error as e:
            print(f"Error fetching files: {e}")
            return []
        finally:
            if connection:
                cursor.close()
                connection.close()
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
            if connection:
                cursor.close()
                connection.close()
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
            if connection:
                cursor.close()
                connection.close()
    return False
