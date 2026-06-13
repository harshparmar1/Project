"""
database.py
===========
Drop-in replacement for the old Motor/MongoDB database module.
Returns a Firestore CollectionReference for any collection name.
"""

from google.cloud.firestore_v1 import CollectionReference
from .firebase_config import get_db


def get_collection(collection_name: str) -> CollectionReference:
    """
    Return a Firestore CollectionReference.

    Usage is intentionally synchronous – wrap calls with
    `starlette.concurrency.run_in_threadpool` inside async route handlers.
    """
    db = get_db()
    return db.collection(collection_name)
