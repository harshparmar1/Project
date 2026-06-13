"""
firebase_config.py
==================
Initializes the Firebase Admin SDK once and exposes a reusable Firestore client.

Configuration priority:
  1. FIREBASE_SERVICE_ACCOUNT_PATH env-var  →  path to service account JSON file
  2. Falls back to the bundled service account JSON found next to this package
     (timetable-proj-1f0c1-firebase-adminsdk-fbsvc-6a3464665d.json in the
      backend/ directory, one level above app/).
"""

import os
import pathlib
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Resolve service-account path
# ---------------------------------------------------------------------------
_SERVICE_ACCOUNT_PATH: str | None = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

if not _SERVICE_ACCOUNT_PATH:
    # Auto-detect: look for any *firebase*adminsdk*.json in the backend/ dir
    _backend_dir = pathlib.Path(__file__).parent.parent  # backend/
    _candidates = sorted(_backend_dir.glob("*firebase*adminsdk*.json"))
    if _candidates:
        _SERVICE_ACCOUNT_PATH = str(_candidates[0])

if not _SERVICE_ACCOUNT_PATH or not pathlib.Path(_SERVICE_ACCOUNT_PATH).exists():
    raise FileNotFoundError(
        "Firebase service account JSON not found. "
        "Set FIREBASE_SERVICE_ACCOUNT_PATH in your .env file or place the "
        "service account JSON in the backend/ directory."
    )

# ---------------------------------------------------------------------------
# Initialize Firebase Admin (idempotent – safe to import multiple times)
# ---------------------------------------------------------------------------
if not firebase_admin._apps:
    _cred = credentials.Certificate(_SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(_cred)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_db() -> firestore.client:
    """Return a Firestore client instance (synchronous)."""
    return firestore.client()
