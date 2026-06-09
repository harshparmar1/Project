import asyncio
import os
import sys
import json
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def main():
    load_dotenv()
    MONGODB_URL = os.getenv("MONGODB_URL")
    DATABASE_NAME = os.getenv("DATABASE_NAME", "timetable_db")
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DATABASE_NAME]

    for col in ["departments", "subjects", "faculty", "faculty_subject", "elective_assignments", "timetable"]:
        print(f"\n--- COLLECTION: {col} ---")
        items = await db[col].find({}).to_list(length=1000)
        for s in items:
            s["_id"] = str(s["_id"])
            print(json.dumps(s, indent=2))

if __name__ == "__main__":
    asyncio.run(main())

