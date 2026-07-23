"""Storage for refresh tokens.

Tokens are stored as SHA-256 hashes, never in the clear, so a database
dump does not hand over live sessions.

Rotation is the reason these are stateful: each use issues a new token
and marks the old one used. If a token that has already been used is
presented again, that means two parties hold it — the legitimate client
and a thief — and the only safe response is to revoke the whole family.
"""

from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

COLLECTION = "refresh_tokens"


class RefreshTokenRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index("token_hash", unique=True)
        await self._collection.create_index("user_id")
        # Mongo removes expired documents on its own, so dead sessions do
        # not accumulate and no cleanup job is needed for them.
        await self._collection.create_index("expires_at", expireAfterSeconds=0)

    async def create(self, user_id: str, token_hash: str, expires_at: datetime) -> None:
        await self._collection.insert_one(
            {
                "user_id": user_id,
                "token_hash": token_hash,
                "expires_at": expires_at,
                "created_at": datetime.now(timezone.utc),
                "used_at": None,
            }
        )

    async def find(self, token_hash: str) -> dict | None:
        return await self._collection.find_one({"token_hash": token_hash})

    async def mark_used(self, token_hash: str) -> bool:
        """Consume a token. False if it was already used — i.e. replayed."""
        result = await self._collection.update_one(
            {"token_hash": token_hash, "used_at": None},
            {"$set": {"used_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count == 1

    async def revoke(self, token_hash: str) -> None:
        await self._collection.delete_one({"token_hash": token_hash})

    async def revoke_all_for_user(self, user_id: str) -> int:
        """Invalidate every session for a user.

        Used on replay detection: once a token is known to be in two
        places, no session for that account can be trusted.
        """
        result = await self._collection.delete_many({"user_id": user_id})
        return result.deleted_count
