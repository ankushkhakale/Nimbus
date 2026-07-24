from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import DEFAULT_STORAGE_QUOTA_BYTES, UserInDB

COLLECTION = "users"


def _doc_to_user(doc: dict) -> UserInDB:
    return UserInDB(
        id=str(doc["_id"]),
        email=doc["email"],
        full_name=doc["full_name"],
        # Older documents predate these fields; default them so existing
        # accounts keep working without a migration.
        hashed_password=doc.get("hashed_password"),
        providers=doc.get("providers", ["password"]),
        storage_quota_bytes=doc.get("storage_quota_bytes", DEFAULT_STORAGE_QUOTA_BYTES),
        created_at=doc["created_at"],
    )


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def get_by_email(self, email: str) -> UserInDB | None:
        doc = await self._collection.find_one({"email": email})
        return _doc_to_user(doc) if doc else None

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        if not ObjectId.is_valid(user_id):
            return None
        doc = await self._collection.find_one({"_id": ObjectId(user_id)})
        return _doc_to_user(doc) if doc else None

    async def create(self, email: str, full_name: str, hashed_password: str) -> UserInDB:
        now = datetime.now(timezone.utc)
        doc = {
            "email": email,
            "full_name": full_name,
            "hashed_password": hashed_password,
            "providers": ["password"],
            "storage_quota_bytes": DEFAULT_STORAGE_QUOTA_BYTES,
            "created_at": now,
        }
        result = await self._collection.insert_one(doc)
        return _doc_to_user({**doc, "_id": result.inserted_id})

    async def create_oauth_user(
        self, email: str, full_name: str, provider: str
    ) -> UserInDB:
        """Account created via OAuth, with no password."""
        now = datetime.now(timezone.utc)
        doc = {
            "email": email,
            "full_name": full_name,
            "hashed_password": None,
            "providers": [provider],
            "storage_quota_bytes": DEFAULT_STORAGE_QUOTA_BYTES,
            "created_at": now,
        }
        result = await self._collection.insert_one(doc)
        return _doc_to_user({**doc, "_id": result.inserted_id})

    async def add_provider(self, user_id: str, provider: str) -> None:
        """Record that an existing account can now also sign in this way.

        $addToSet so re-linking the same provider is idempotent.
        """
        await self._collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$addToSet": {"providers": provider}},
        )

    async def update_profile(
        self, user_id: str, *, full_name: str | None, storage_quota_bytes: int | None
    ) -> UserInDB | None:
        updates: dict = {}
        if full_name is not None:
            updates["full_name"] = full_name
        if storage_quota_bytes is not None:
            updates["storage_quota_bytes"] = storage_quota_bytes
        if not updates:
            return await self.get_by_id(user_id)
        doc = await self._collection.find_one_and_update(
            {"_id": ObjectId(user_id)}, {"$set": updates}, return_document=True
        )
        return _doc_to_user(doc) if doc else None

    async def update_password(self, user_id: str, hashed_password: str) -> None:
        # $addToSet here too: an OAuth-only account setting its first
        # password now also signs in with one, so "password" belongs in
        # providers alongside whatever got them here originally.
        await self._collection.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {"hashed_password": hashed_password},
                "$addToSet": {"providers": "password"},
            },
        )

    async def ensure_indexes(self) -> None:
        await self._collection.create_index("email", unique=True)
