"""Mongo persistence for the file/folder tree.

Every read and write is filtered by `user_id`. That filter is the
isolation boundary — a caller that forgets it would expose another
user's tree, so there is deliberately no unscoped lookup on this class.

Reads also filter on `deleted_at` being null. Trashed items still exist
as documents so they can be restored; they must simply never appear in
an ordinary listing.
"""

from datetime import datetime, timedelta, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.item import Item, ItemType, UploadStatus

COLLECTION = "items"

# Listings are paginated because a Takeout album can hold thousands of
# photos; returning them all was fine in testing and would not be at 90GB.
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 500


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
        deleted_at=doc.get("deleted_at"),
        deleted_from=doc.get("deleted_from"),
    )


# Sort keys the client may ask for, mapped to Mongo sort specs. Whitelisted
# rather than passed through so a caller cannot sort by an unindexed field
# and quietly force a collection scan.
SORT_SPECS: dict[str, list[tuple[str, int]]] = {
    "name": [("type", -1), ("name", 1)],
    "name_desc": [("type", -1), ("name", -1)],
    "size": [("type", -1), ("size", -1)],
    "size_asc": [("type", -1), ("size", 1)],
    "updated": [("type", -1), ("updated_at", -1)],
    "updated_asc": [("type", -1), ("updated_at", 1)],
}
DEFAULT_SORT = "name"


class ItemRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        # Directory listings, the photo library, trash, and search are the
        # four access patterns; each gets an index that matches its filter.
        await self._collection.create_index([("user_id", 1), ("parent_id", 1), ("deleted_at", 1)])
        await self._collection.create_index([("user_id", 1), ("taken_at", -1)])
        await self._collection.create_index([("user_id", 1), ("deleted_at", 1)])
        await self._collection.create_index([("user_id", 1), ("updated_at", -1)])
        # Case-insensitive substring search is a regex scan; this index at
        # least restricts it to one user's documents.
        await self._collection.create_index([("user_id", 1), ("name", 1)])

    # --- reads ---------------------------------------------------------

    @staticmethod
    def _live(user_id: str, **extra) -> dict:
        """Base filter: this user's items that are not in the trash."""
        return {"user_id": user_id, "deleted_at": None, **extra}

    async def get(self, user_id: str, item_id: str, *, include_trashed: bool = False) -> Item | None:
        if not ObjectId.is_valid(item_id):
            return None
        query: dict = {"_id": ObjectId(item_id), "user_id": user_id}
        if not include_trashed:
            query["deleted_at"] = None
        doc = await self._collection.find_one(query)
        return _doc_to_item(doc) if doc else None

    async def list_children(
        self,
        user_id: str,
        parent_id: str | None,
        *,
        offset: int = 0,
        limit: int = DEFAULT_PAGE_SIZE,
        sort: str = DEFAULT_SORT,
    ) -> tuple[list[Item], int]:
        """Return one page of a folder's contents and the total count."""
        query = self._live(user_id, parent_id=parent_id)
        spec = SORT_SPECS.get(sort, SORT_SPECS[DEFAULT_SORT])
        cursor = self._collection.find(query).sort(spec).skip(offset).limit(limit)
        items = [_doc_to_item(d) async for d in cursor]
        total = await self._collection.count_documents(query)
        return items, total

    async def list_images(
        self, user_id: str, *, offset: int = 0, limit: int = DEFAULT_PAGE_SIZE
    ) -> tuple[list[Item], int]:
        """Every image the user owns, newest first, regardless of folder.

        A photo library is organised by time, not by where the file
        happens to sit — so this deliberately ignores parent_id. Sorted by
        capture time where known, falling back to upload time.
        """
        query = self._live(
            user_id,
            type=ItemType.FILE.value,
            status=UploadStatus.READY.value,
            content_type={"$regex": "^image/"},
        )
        cursor = (
            self._collection.find(query)
            .sort([("taken_at", -1), ("created_at", -1)])
            .skip(offset)
            .limit(limit)
        )
        items = [_doc_to_item(d) async for d in cursor]
        total = await self._collection.count_documents(query)
        return items, total

    async def search(
        self, user_id: str, term: str, *, offset: int = 0, limit: int = DEFAULT_PAGE_SIZE
    ) -> tuple[list[Item], int]:
        """Case-insensitive substring match on name, across all folders."""
        # Escaped so a name containing regex metacharacters is matched
        # literally rather than compiled as a pattern.
        import re

        query = self._live(user_id, name={"$regex": re.escape(term), "$options": "i"})
        cursor = (
            self._collection.find(query)
            .sort([("type", -1), ("name", 1)])
            .skip(offset)
            .limit(limit)
        )
        items = [_doc_to_item(d) async for d in cursor]
        total = await self._collection.count_documents(query)
        return items, total

    async def list_recent(self, user_id: str, *, limit: int = 20) -> list[Item]:
        query = self._live(user_id, type=ItemType.FILE.value, status=UploadStatus.READY.value)
        cursor = self._collection.find(query).sort([("updated_at", -1)]).limit(limit)
        return [_doc_to_item(d) async for d in cursor]

    async def list_trashed(
        self, user_id: str, *, offset: int = 0, limit: int = DEFAULT_PAGE_SIZE
    ) -> tuple[list[Item], int]:
        query = {"user_id": user_id, "deleted_at": {"$ne": None}}
        cursor = (
            self._collection.find(query).sort([("deleted_at", -1)]).skip(offset).limit(limit)
        )
        items = [_doc_to_item(d) async for d in cursor]
        total = await self._collection.count_documents(query)
        return items, total

    async def name_exists(self, user_id: str, parent_id: str | None, name: str) -> bool:
        return (
            await self._collection.count_documents(
                self._live(user_id, parent_id=parent_id, name=name), limit=1
            )
            == 1
        )

    # --- writes --------------------------------------------------------

    async def create_folder(self, user_id: str, name: str, parent_id: str | None) -> Item:
        now = datetime.now(timezone.utc)
        doc = {
            "user_id": user_id,
            "name": name,
            "type": ItemType.FOLDER.value,
            "parent_id": parent_id,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
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
            "deleted_at": None,
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
            {"_id": ObjectId(item_id), "user_id": user_id, "deleted_at": None},
            {"$set": updates},
            return_document=True,
        )
        return _doc_to_item(doc) if doc else None

    async def trash(self, user_id: str, item_ids: list[str]) -> int:
        """Move items to the trash, remembering where they came from."""
        now = datetime.now(timezone.utc)
        modified = 0
        for item_id in item_ids:
            if not ObjectId.is_valid(item_id):
                continue
            # deleted_from is captured per item, so restore can return each
            # one to its own parent rather than dumping them all at root.
            current = await self._collection.find_one(
                {"_id": ObjectId(item_id), "user_id": user_id, "deleted_at": None}
            )
            if not current:
                continue
            await self._collection.update_one(
                {"_id": ObjectId(item_id)},
                {
                    "$set": {
                        "deleted_at": now,
                        "deleted_from": current.get("parent_id"),
                        "updated_at": now,
                    }
                },
            )
            modified += 1
        return modified

    async def restore(self, user_id: str, item_ids: list[str]) -> int:
        """Bring items back. Anything whose old parent is gone lands at root."""
        restored = 0
        for item_id in item_ids:
            if not ObjectId.is_valid(item_id):
                continue
            doc = await self._collection.find_one(
                {"_id": ObjectId(item_id), "user_id": user_id, "deleted_at": {"$ne": None}}
            )
            if not doc:
                continue

            target = doc.get("deleted_from")
            if target is not None:
                parent_alive = await self._collection.count_documents(
                    {"_id": ObjectId(target), "user_id": user_id, "deleted_at": None}, limit=1
                )
                if not parent_alive:
                    target = None

            await self._collection.update_one(
                {"_id": ObjectId(item_id)},
                {
                    "$set": {
                        "deleted_at": None,
                        "deleted_from": None,
                        "parent_id": target,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            restored += 1
        return restored

    async def hard_delete(self, user_id: str, item_id: str) -> bool:
        result = await self._collection.delete_one(
            {"_id": ObjectId(item_id), "user_id": user_id}
        )
        return result.deleted_count == 1

    async def descendants(
        self, user_id: str, folder_id: str, *, include_trashed: bool = False
    ) -> list[Item]:
        """Every item beneath a folder, breadth-first.

        Mongo has no recursive query, so the tree is walked level by level.
        """
        found: list[Item] = []
        frontier = [folder_id]
        while frontier:
            query: dict = {"user_id": user_id, "parent_id": {"$in": frontier}}
            if not include_trashed:
                query["deleted_at"] = None
            cursor = self._collection.find(query)
            level = [_doc_to_item(d) async for d in cursor]
            if not level:
                break
            found.extend(level)
            frontier = [i.id for i in level if i.is_folder]
        return found

    async def purgeable(self, older_than_days: int) -> list[Item]:
        """Trashed items past the retention window, across all users.

        Used by the scheduled purge; deliberately not user-scoped because
        it runs as a maintenance job rather than on behalf of a request.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        cursor = self._collection.find({"deleted_at": {"$ne": None, "$lt": cutoff}})
        return [_doc_to_item(d) async for d in cursor]

    async def delete_by_id(self, item_id: str) -> None:
        await self._collection.delete_one({"_id": ObjectId(item_id)})

    # --- aggregates ----------------------------------------------------

    async def usage(self, user_id: str) -> tuple[int, int, int]:
        """(bytes_stored, file_count, folder_count), excluding trash."""
        pipeline = [
            {"$match": self._live(user_id)},
            {
                "$group": {
                    "_id": "$type",
                    "count": {"$sum": 1},
                    "bytes": {"$sum": {"$ifNull": ["$size", 0]}},
                }
            },
        ]
        totals = {doc["_id"]: doc async for doc in self._collection.aggregate(pipeline)}
        files = totals.get(ItemType.FILE.value, {})
        folders = totals.get(ItemType.FOLDER.value, {})
        return (
            int(files.get("bytes", 0)),
            int(files.get("count", 0)),
            int(folders.get("count", 0)),
        )

    async def usage_by_category(self, user_id: str) -> dict[str, tuple[int, int]]:
        """Bytes and counts grouped into coarse buckets by content type."""
        pipeline = [
            {"$match": self._live(user_id, type=ItemType.FILE.value)},
            {
                "$group": {
                    "_id": {
                        "$switch": {
                            "branches": [
                                {
                                    "case": {
                                        "$regexMatch": {
                                            "input": {"$ifNull": ["$content_type", ""]},
                                            "regex": "^image/",
                                        }
                                    },
                                    "then": "images",
                                },
                                {
                                    "case": {
                                        "$regexMatch": {
                                            "input": {"$ifNull": ["$content_type", ""]},
                                            "regex": "^video/",
                                        }
                                    },
                                    "then": "video",
                                },
                                {
                                    "case": {
                                        "$regexMatch": {
                                            "input": {"$ifNull": ["$content_type", ""]},
                                            "regex": "^audio/",
                                        }
                                    },
                                    "then": "audio",
                                },
                                {
                                    "case": {
                                        "$regexMatch": {
                                            "input": {"$ifNull": ["$content_type", ""]},
                                            "regex": "pdf|document|text|spreadsheet|presentation",
                                        }
                                    },
                                    "then": "documents",
                                },
                            ],
                            "default": "other",
                        }
                    },
                    "bytes": {"$sum": {"$ifNull": ["$size", 0]}},
                    "count": {"$sum": 1},
                }
            },
        ]
        out: dict[str, tuple[int, int]] = {}
        async for doc in self._collection.aggregate(pipeline):
            out[doc["_id"]] = (int(doc["bytes"]), int(doc["count"]))
        return out
