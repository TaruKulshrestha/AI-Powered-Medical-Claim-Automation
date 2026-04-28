from database import pg_cursor, pg_conn
from database import mongo_db  # MongoDB connection

# Get all PDFs from MongoDB
all_bills = mongo_db.medical_bills.find({})

# Insert each PDF as a claim in PostgreSQL
for bill in all_bills:
    file_name = bill["file_name"]
    
    pg_cursor.execute("""
        INSERT INTO claims (mongo_bill_id, status, final_amount)
        VALUES (%s, %s, %s)
    """, (file_name, "Pending", 0))

# Commit the changes
pg_conn.commit()

print("All claims inserted in PostgreSQL")
