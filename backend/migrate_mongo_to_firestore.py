"""
migrate_mongo_to_firestore.py
=============================
Migration script to copy all existing data from MongoDB to Firebase Firestore.
Reads MongoDB connection details from the backend/.env file and writes to Firestore.
"""

import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

# Ensure we can import modules from app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.firebase_config import get_db

# Load environment
load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "timetable_db")

if not MONGODB_URL:
    print("Error: MONGODB_URL is not set in the environment or .env file.")
    sys.exit(1)

COLLECTIONS = [
    "departments",
    "users",
    "subjects",
    "faculty",
    "faculty_subject",
    "elective_assignments",
    "timetable"
]

def migrate():
    print(f"Connecting to MongoDB database '{DATABASE_NAME}'...")
    mongo_client = MongoClient(MONGODB_URL)
    mongo_db = mongo_client[DATABASE_NAME]

    firestore_db = get_db()

    print("\nStarting migration...")
    for coll_name in COLLECTIONS:
        mongo_coll = mongo_db[coll_name]
        
        # Read from MongoDB
        docs = list(mongo_coll.find({}))
        print(f"Collection '{coll_name}': Found {len(docs)} documents in MongoDB.")

        if not docs:
            continue

        firestore_coll = firestore_db.collection(coll_name)

        # Batch writes to Firestore
        batch = firestore_db.batch()
        batch_size = 0
        migrated_count = 0

        for doc in docs:
            # Clean up MongoDB-specific _id before storing
            # We convert it to a string and store it as '_id' or let Firestore use it
            doc_id = str(doc.pop("_id"))
            
            # Use document reference with the MongoDB ObjectId string to preserve references if needed,
            # or just let Firestore auto-assign. We'll use the MongoDB _id string as the document ID
            # in Firestore to preserve any references exactly.
            doc_ref = firestore_coll.document(doc_id)
            batch.set(doc_ref, doc)
            
            batch_size += 1
            migrated_count += 1

            if batch_size >= 400:
                batch.commit()
                batch = firestore_db.batch()
                batch_size = 0

        if batch_size > 0:
            batch.commit()

        print(f"Collection '{coll_name}': Successfully migrated {migrated_count} documents to Firestore.")

    print("\nMigration completed successfully!")

if __name__ == "__main__":
    migrate()
