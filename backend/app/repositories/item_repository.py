"""Mongo persistence for the file/folder tree.

Every read and write is filtered by `user_id`. That filter is the
isolation boundary — a caller that forgets it would expose another
user's tree, so there is deliberately no unscoped lookup on this class.
"""

from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.item import Item, ItemType, UploadStatus

COLLECTION = "items"


def _doc_to_item(doc: dict) -> Item:
    return Item(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        name=doc["name"],
        type=doc["type"],
        parent_id=doc.get("parent_id"),
        s3_key=doc.get("s3_key"),
        size=doc.get("size"),
        content_type=doc.get("content_type"),
        status=doc.get("status"),
        taken_at=doc.get("taken_at"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


class ItemRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        # Directory listings and the photo grid are the two hot paths.
        await self._collection.create_index([("user_id", 1), ("parent_id", 1)])
        await self._collection.create_index([("user_id", 1), ("taken_at", -1)])

    async def get(self, user_id: str, item_id: str) -> Item | None:
        if not ObjectId.is_valid(item_id):
            return None
        doc = await self._collection.find_one({"_id": ObjectId(item_id), "user_id": user_id})
        return _doc_to_item(doc) if doc else None

    async def list_children(self, user_id: str, parent_id: str | None) -> list[Item]:
        cursor = self._collection.find({"user_id": user_id, "parent_id": parent_id}).sort(
            # Folders first, then alphabetical — conventional file-browser order.
            [("type", -1), ("name", 1)]
        )
        return [_doc_to_item(d) async for d in cursor]

    async def create_folder(self, user_id: str, name: str, parent_id: str | None) -> Item:
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "name": name,
            "type": ItemType.FOLDER.value,
            "parent_id": parent_id,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._collection.insert_one(doc)
        return _doc_to_item({**doc, "_id": result.inserted_id})

    async def create_pending_file(
        self,
        user_id: str,
        name: str,
        parent_id: str | None,
        s3_key: str,
        content_type: str | None,
    ) -> Item:
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "name": name,
            "type": ItemType.FILE.value,
            "parent_id": parent_id,
            "s3_key": s3_key,
            "content_type": content_type,
            "size": None,
            "status": UploadStatus.PENDING.value,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._collection.insert_one(doc)
        return _doc_to_item({**doc, "_id": result.inserted_id})

    async def mark_ready(self, user_id: str, item_id: str, size: int) -> Item | None:
        doc = await self._collection.find_one_and_update(
            {"_id": ObjectId(item_id), "user_id": user_id},
            {
                "$set": {
                    "status": UploadStatus.READY.value,
                    "size": size,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=True,
        )
        return _doc_to_item(doc) if doc else None

    async def rename_or_move(
        self, user_id: str, item_id: str, *, name: str | None, parent_id: str | None, move: bool
    ) -> Item | None:
        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        if name is not None:
            updates["name"] = name
        if move:
            updates["parent_id"] = parent_id
        doc = await self._collection.find_one_and_update(
            {"_id": ObjectId(item_id), "user_id": user_id},
            {"$set": updates},
            return_document=True,
        )
        return _doc_to_item(doc) if doc else None

    async def delete(self, user_id: str, item_id: str) -> bool:
        result = await self._collection.delete_one(
            {"_id": ObjectId(item_id), "user_id": user_id}
        )
        return result.deleted_count == 1

    async def descendants(self, user_id: str, folder_id: str) -> list[Item]:
        """Every item beneath a folder, breadth-first.

        Used to delete a folder's contents. Mongo has no recursive query,
        so the tree is walked level by level.
        """
        found: list[Item] = []
        frontier = [folder_id]
        while frontier:
            cursor = self._collection.find(
                {"user_id": user_id, "parent_id": {"$in": frontier}}
            )
            level = [_doc_to_item(d) async for d in cursor]
            if not level:
                break
            found.extend(level)
            frontier = [i.id for i in level if i.is_folder]
        return found

    async def name_exists(self, user_id: str, parent_id: str | None, name: str) -> bool:
        return await self._collection.count_documents(
            {"user_id": user_id, "parent_id": parent_id, "name": name}, limit=1
        ) == 1
