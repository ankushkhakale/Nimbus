"""Mongo persistence for the activity feed.

Bounded by a TTL index rather than an application-side cap: entries
older than the retention window delete themselves, so the feed stays a
recent history without a cleanup job. Recording is best-effort — a
failed insert must never break the operation that triggered it.
"""

from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.activity import Activity

COLLECTION = "activity"

# Entries older than this delete themselves. A feed, not an audit log —
# 90 days is plenty of "recent history" without growing unbounded.
RETENTION_SECONDS = 90 * 24 * 60 * 60


def _doc_to_activity(doc: dict) -> Activity:
    return Activity(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        action=doc["action"],
        item_name=doc.get("item_name"),
        detail=doc.get("detail"),
        created_at=doc["created_at"],
    )


class ActivityRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("user_id", 1), ("created_at", -1)])
        await self._collection.create_index("created_at", expireAfterSeconds=RETENTION_SECONDS)

    async def record(
        self,
        user_id: str,
        action: str,
        *,
        item_name: str | None = None,
        detail: str | None = None,
    ) -> None:
        await self._collection.insert_one(
            {
                "user_id": user_id,
                "action": action,
                "item_name": item_name,
                "detail": detail,
                "created_at": datetime.now(timezone.utc),
            }
        )

    async def list_for_user(self, user_id: str, *, limit: int = 100) -> list[Activity]:
        cursor = (
            self._collection.find({"user_id": user_id}).sort("created_at", -1).limit(limit)
        )
        return [_doc_to_activity(d) async for d in cursor]
