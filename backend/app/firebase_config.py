"""
firebase_config.py
==================
Initializes the Firebase Admin SDK once and exposes a reusable Firestore client.

Configuration priority:
  - This has been adapted to redirect all calls to MongoDB (using pymongo)
    as a drop-in replacement because the cloud Firestore keys have been revoked.
"""

import os
from pymongo import MongoClient
from bson.objectid import ObjectId
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Resolve MongoDB connection details
# ---------------------------------------------------------------------------
MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "timetable_db")

_mongo_client = None

def get_mongo_db():
    global _mongo_client
    if _mongo_client is None:
        if not MONGODB_URL:
            raise ValueError("MONGODB_URL is not set in environment or .env file.")
        _mongo_client = MongoClient(MONGODB_URL)
    return _mongo_client[DATABASE_NAME]


# ---------------------------------------------------------------------------
# Mock Firestore API Adapter Classes
# ---------------------------------------------------------------------------

class MockAggregationResult:
    def __init__(self, value):
        self.value = value

class MockAggregationQuery:
    def __init__(self, collection_name, query_dict):
        self.collection_name = collection_name
        self.query_dict = query_dict

    def get(self):
        db = get_mongo_db()
        count_val = db[self.collection_name].count_documents(self.query_dict)
        return [[MockAggregationResult(count_val)]]

class MockDocumentReference:
    def __init__(self, collection_name, document_id):
        self.collection_name = collection_name
        self.id = document_id
        
    def get(self):
        db = get_mongo_db()
        query = {}
        try:
            query["_id"] = ObjectId(self.id)
            doc = db[self.collection_name].find_one(query)
            if not doc:
                query["_id"] = self.id
                doc = db[self.collection_name].find_one(query)
        except Exception:
            query["_id"] = self.id
            doc = db[self.collection_name].find_one(query)
            
        return MockDocumentSnapshot(self.id, doc, self)

    def update(self, data):
        db = get_mongo_db()
        query = {}
        try:
            query["_id"] = ObjectId(self.id)
            if db[self.collection_name].count_documents(query) == 0:
                query["_id"] = self.id
        except Exception:
            query["_id"] = self.id
            
        db[self.collection_name].update_one(query, {"$set": data})

    def delete(self):
        db = get_mongo_db()
        query = {}
        try:
            query["_id"] = ObjectId(self.id)
            if db[self.collection_name].count_documents(query) == 0:
                query["_id"] = self.id
        except Exception:
            query["_id"] = self.id
        db[self.collection_name].delete_one(query)

class MockDocumentSnapshot:
    def __init__(self, document_id, data, reference):
        self.id = document_id
        self._data = data
        self.reference = reference
        
    @property
    def exists(self):
        return self._data is not None

    def to_dict(self):
        if not self._data:
            return None
        d = dict(self._data)
        if "_id" in d:
            d.pop("_id")
        return d

class MockQuery:
    def __init__(self, collection_name, query_dict=None):
        self.collection_name = collection_name
        self.query_dict = query_dict if query_dict is not None else {}
        self._limit = None

    def where(self, field, op, value):
        new_query = dict(self.query_dict)
        if op == "==":
            new_query[field] = value
        elif op == "!=":
            new_query[field] = {"$ne": value}
        elif op == ">=":
            new_query[field] = {"$gte": value}
        elif op == "<=":
            new_query[field] = {"$lte": value}
        elif op == ">":
            new_query[field] = {"$gt": value}
        elif op == "<":
            new_query[field] = {"$lt": value}
        elif op == "in":
            new_query[field] = {"$in": value}
        return MockQuery(self.collection_name, new_query)

    def limit(self, limit_num):
        q = MockQuery(self.collection_name, self.query_dict)
        q._limit = limit_num
        return q

    def count(self):
        return MockAggregationQuery(self.collection_name, self.query_dict)

    def stream(self):
        db = get_mongo_db()
        cursor = db[self.collection_name].find(self.query_dict)
        if self._limit is not None:
            cursor = cursor.limit(self._limit)
        
        results = []
        for doc in cursor:
            doc_id = str(doc.get("_id"))
            results.append(MockDocumentSnapshot(doc_id, doc, MockDocumentReference(self.collection_name, doc_id)))
        return results

class MockCollectionReference(MockQuery):
    def __init__(self, collection_name):
        super().__init__(collection_name)

    def document(self, document_id=None):
        if document_id is None:
            document_id = str(ObjectId())
        return MockDocumentReference(self.collection_name, document_id)

    def add(self, data):
        db = get_mongo_db()
        doc_data = dict(data)
        res = db[self.collection_name].insert_one(doc_data)
        doc_id = str(res.inserted_id)
        return None, MockDocumentReference(self.collection_name, doc_id)

class MockWriteBatch:
    def __init__(self):
        self.operations = []

    def set(self, doc_ref, data):
        self.operations.append(("set", doc_ref, data))

    def update(self, doc_ref, data):
        self.operations.append(("update", doc_ref, data))

    def delete(self, doc_ref):
        self.operations.append(("delete", doc_ref, None))

    def commit(self):
        db = get_mongo_db()
        for op_type, doc_ref, data in self.operations:
            coll_name = doc_ref.collection_name
            doc_id = doc_ref.id
            query = {}
            try:
                query["_id"] = ObjectId(doc_id)
                if db[coll_name].count_documents(query) == 0:
                    query["_id"] = doc_id
            except Exception:
                query["_id"] = doc_id

            if op_type == "set":
                db[coll_name].replace_one(query, data, upsert=True)
            elif op_type == "update":
                db[coll_name].update_one(query, {"$set": data})
            elif op_type == "delete":
                db[coll_name].delete_one(query)
        self.operations = []

class MockFirestoreClient:
    def collection(self, collection_name):
        return MockCollectionReference(collection_name)

    def batch(self):
        return MockWriteBatch()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_db() -> MockFirestoreClient:
    """Return a Firestore client instance (synchronous)."""
    return MockFirestoreClient()
