"""Mongo persistence for recent sign-ins.

Same TTL-bounded, best-effort pattern as the activity feed, with a
longer window — noticing an unfamiliar login weeks later is exactly the
point of this list.
"""

from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.login_activity import LoginActivity

COLLECTION = "login_activity"

RETENTION_SECONDS = 180 * 24 * 60 * 60


def _doc_to_login_activity(doc: dict) -> LoginActivity:
    return LoginActivity(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        method=doc["method"],
        ip=doc.get("ip"),
        user_agent=doc.get("user_agent"),
        created_at=doc["created_at"],
    )


class LoginActivityRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("user_id", 1), ("created_at", -1)])
        await self._collection.create_index("created_at", expireAfterSeconds=RETENTION_SECONDS)

    async def record(
        self,
        user_id: str,
        method: str,
        *,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        await self._collection.insert_one(
            {
                "user_id": user_id,
                "method": method,
                "ip": ip,
                "user_agent": user_agent,
                "created_at": datetime.now(timezone.utc),
            }
        )

    async def list_for_user(self, user_id: str, *, limit: int = 50) -> list[LoginActivity]:
        cursor = (
            self._collection.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
        )
        return [_doc_to_login_activity(d) async for d in cursor]
