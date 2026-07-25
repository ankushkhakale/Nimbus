"""Mongo persistence for file versions.

Every read is scoped by user_id (the isolation boundary, as everywhere)
and item_id. Retention is bounded by the service, which deletes the
oldest version — object and document — once an item exceeds the cap.
"""

from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.file_version import FileVersion

COLLECTION = "file_versions"


def _doc_to_version(doc: dict) -> FileVersion:
    return FileVersion(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        item_id=doc["item_id"],
        version_number=doc["version_number"],
        s3_key=doc["s3_key"],
        size=doc.get("size"),
        content_type=doc.get("content_type"),
        name=doc["name"],
        created_at=doc["created_at"],
    )


class VersionRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("user_id", 1), ("item_id", 1), ("version_number", -1)])

    async def next_version_number(self, user_id: str, item_id: str) -> int:
        """Max existing number + 1, so numbering keeps climbing even after
        older versions age out of the retention window."""
        doc = await self._collection.find_one(
            {"user_id": user_id, "item_id": item_id}, sort=[("version_number", -1)]
        )
        return (doc["version_number"] + 1) if doc else 1

    async def create(
        self,
        user_id: str,
        item_id: str,
        *,
        version_number: int,
        s3_key: str,
        size: int | None,
        content_type: str | None,
        name: str,
    ) -> FileVersion:
        doc = {
            "user_id": user_id,
            "item_id": item_id,
            "version_number": version_number,
            "s3_key": s3_key,
            "size": size,
            "content_type": content_type,
            "name": name,
            "created_at": datetime.now(timezone.utc),
        }
        result = await self._collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return _doc_to_version(doc)

    async def list_for_item(self, user_id: str, item_id: str) -> list[FileVersion]:
        cursor = self._collection.find({"user_id": user_id, "item_id": item_id}).sort(
            "version_number", -1
        )
        return [_doc_to_version(d) async for d in cursor]

    async def get(self, user_id: str, version_id: str) -> FileVersion | None:
        if not ObjectId.is_valid(version_id):
            return None
        doc = await self._collection.find_one({"_id": ObjectId(version_id), "user_id": user_id})
        return _doc_to_version(doc) if doc else None

    async def count_for_item(self, user_id: str, item_id: str) -> int:
        return await self._collection.count_documents({"user_id": user_id, "item_id": item_id})

    async def oldest_for_item(self, user_id: str, item_id: str) -> FileVersion | None:
        doc = await self._collection.find_one(
            {"user_id": user_id, "item_id": item_id}, sort=[("version_number", 1)]
        )
        return _doc_to_version(doc) if doc else None

    async def delete(self, user_id: str, version_id: str) -> bool:
        if not ObjectId.is_valid(version_id):
            return False
        result = await self._collection.delete_one({"_id": ObjectId(version_id), "user_id": user_id})
        return result.deleted_count == 1

    async def list_all_for_item(self, user_id: str, item_id: str) -> list[FileVersion]:
        """Every version's document, for cleanup when an item is
        permanently deleted."""
        return await self.list_for_item(user_id, item_id)

    async def delete_all_for_item(self, user_id: str, item_id: str) -> int:
        result = await self._collection.delete_many({"user_id": user_id, "item_id": item_id})
        return result.deleted_count
