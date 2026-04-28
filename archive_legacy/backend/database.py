from pymongo import MongoClient
import psycopg2

# MongoDB
mongo_client = MongoClient("mongodb://localhost:27017/")
mongo_db = mongo_client.insurance_docs

# PostgreSQL
pg_conn = psycopg2.connect(
    dbname="insurance_claims",
    user="postgres",
    password="Tiya@893",
    host="localhost"
)
pg_cursor = pg_conn.cursor()
