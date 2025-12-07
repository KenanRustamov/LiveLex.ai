from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.core.config import settings
from app.db.models import SessionDoc, UserDataDoc, PerformanceMetricDoc, AssignmentDoc

_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    global _client
    if _client:
        return
    if not settings.mongodb_uri:
        raise RuntimeError("Missing MongoDB URI. Set MONGO_USER/MONGO_PASS or MONGODB_URI")
    _client = AsyncIOMotorClient(settings.mongodb_uri, tls=True)
    db = _client[settings.mongodb_db]
    await init_beanie(database=db, document_models=[SessionDoc, UserDataDoc, PerformanceMetricDoc, AssignmentDoc])


