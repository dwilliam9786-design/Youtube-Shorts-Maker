"""Database (Motor / MongoDB) singleton."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

_MONGO_URL = os.environ.get("MONGO_URL")
_DB_NAME = os.environ.get("DB_NAME")

if not _MONGO_URL or not _DB_NAME:
    raise RuntimeError("MONGO_URL and DB_NAME must be set in backend/.env")

client = AsyncIOMotorClient(_MONGO_URL)
db = client[_DB_NAME]

# Collections
projects = db.projects
renders = db.renders
assets = db.assets
