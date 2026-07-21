from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import UserInDB

COLLECTION = "users"


def _doc_to_user(doc: dict) -> UserInDB:
    return UserInDB(
        id=str(doc["_id"]),
        email=doc["email"],
        full_name=doc["full_name"],
        hashed_password=doc["hashed_password"],
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
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        result = await self._collection.insert_one(
            {
                "email": email,
                "full_name": full_name,
                "hashed_password": hashed_password,
                "created_at": now,
            }
        )
        return UserInDB(
            id=str(result.inserted_id),
            email=email,
            full_name=full_name,
            hashed_password=hashed_password,
            created_at=now,
        )

    async def ensure_indexes(self) -> None:
        await self._collection.create_index("email", unique=True)
