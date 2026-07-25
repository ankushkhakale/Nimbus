"""Mongo persistence for share links.

Unlike items, shares are never truly "deleted" by the owner — revoking
one sets `revoked_at` rather than removing the document, so the owner's
share list stays an audit trail of what has ever been shared. Only the
purge job's bookkeeping (n/a here) would remove rows outright.
"""

from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.share import Share

COLLECTION = "shares"


def _doc_to_share(doc: dict) -> Share:
    return Share(
        id=str(doc["_id"]),
        owner_id=doc["owner_id"],
        item_id=doc["item_id"],
        token=doc["token"],
        recipient_emails=doc.get("recipient_emails", []),
        expires_at=doc.get("expires_at"),
        revoked_at=doc.get("revoked_at"),
        created_at=doc["created_at"],
    )


class ShareRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db[COLLECTION]

    async def ensure_indexes(self) -> None:
        await self._collection.create_index("token", unique=True)
        await self._collection.create_index([("owner_id", 1), ("created_at", -1)])
        await self._collection.create_index("recipient_emails")

    async def create(
        self,
        owner_id: str,
        item_id: str,
        token: str,
        *,
        recipient_emails: list[str],
        expires_at: datetime | None,
    ) -> Share:
        doc = {
            "owner_id": owner_id,
            "item_id": item_id,
            "token": token,
            "recipient_emails": recipient_emails,
            "expires_at": expires_at,
            "revoked_at": None,
            "created_at": datetime.now(timezone.utc),
        }
        result = await self._collection.insert_one(doc)
        doc["_id"] = result.inserted_id
        return _doc_to_share(doc)

    async def get_by_token(self, token: str) -> Share | None:
        doc = await self._collection.find_one({"token": token})
        return _doc_to_share(doc) if doc else None

    async def get(self, owner_id: str, share_id: str) -> Share | None:
        if not ObjectId.is_valid(share_id):
            return None
        doc = await self._collection.find_one({"_id": ObjectId(share_id), "owner_id": owner_id})
        return _doc_to_share(doc) if doc else None

    async def list_by_owner(self, owner_id: str) -> list[Share]:
        cursor = self._collection.find({"owner_id": owner_id}).sort("created_at", -1)
        return [_doc_to_share(d) async for d in cursor]

    async def list_received(self, email: str) -> list[Share]:
        """Active shares (not revoked, not expired) addressed to `email`.

        Purely additive to `recipient_emails` — a public (empty-list)
        share never shows up here, since it isn't addressed to anyone
        in particular.
        """
        cursor = self._collection.find(
            {
                "recipient_emails": email,
                "revoked_at": None,
                "$or": [
                    {"expires_at": None},
                    {"expires_at": {"$gt": datetime.now(timezone.utc)}},
                ],
            }
        ).sort("created_at", -1)
        return [_doc_to_share(d) async for d in cursor]

    async def revoke(self, owner_id: str, share_id: str) -> bool:
        if not ObjectId.is_valid(share_id):
            return False
        result = await self._collection.update_one(
            {"_id": ObjectId(share_id), "owner_id": owner_id, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count == 1
