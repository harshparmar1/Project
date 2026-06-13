from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
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
    def seed_departments():
        coll = get_collection("departments")
        try:
            count = coll.count().get()[0][0].value
        except Exception:
            count = len(list(coll.limit(1).stream()))
        
        if count == 0:
            coll.add({"name": "Data Science", "code": "DS2026"})
            coll.add({"name": "Forensic Science", "code": "FS2026"})

    await run_in_threadpool(seed_departments)

@app.get("/")
async def root():
    return {"message": "Welcome to AI Timetable API"}
