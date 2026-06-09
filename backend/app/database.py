import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DATABASE_NAME = os.getenv("DATABASE_NAME", "timetable_db")

client = AsyncIOMotorClient(MONGODB_URL)
database = client[DATABASE_NAME]

async def get_collection(collection_name: str):
    return database[collection_name]
