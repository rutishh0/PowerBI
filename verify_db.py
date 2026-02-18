from db import init_db, get_db_connection

print("Testing PostgreSQL database connection...")
conn = get_db_connection()
if conn:
    print("Connection successful!")
    conn.close()
    print("Initializing table (file_uploads)...")
    init_db()
    print("Verification complete.")
else:
    print("Connection failed.")
