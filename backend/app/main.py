from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes.api import router as api_router
from .database import get_collection

app = FastAPI(title="AI Timetable Generation System")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    # Seed default department codes
    coll = await get_collection("departments")
    count = await coll.count_documents({})
    if count == 0:
        await coll.insert_many([
            {"name": "Data Science", "code": "DS2026"},
            {"name": "Forensic Science", "code": "FS2026"}
        ])

@app.get("/")
async def root():
    return {"message": "Welcome to AI Timetable API"}

