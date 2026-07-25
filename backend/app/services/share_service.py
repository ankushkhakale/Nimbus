"""Share-link business rules.

A share grants read-only access to one item — and, for a folder, its
whole subtree — to whoever holds the token. Every method that resolves
a token re-checks `is_active` and, for folder browsing/downloads,
re-walks the tree to confirm the requested item is actually inside the
shared subtree: a link to one folder must never leak a sibling folder
just because a client passed a different `item_id`.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.item import Item
from app.models.share import Share
from app.repositories.item_repository import ItemRepository
from app.repositories.share_repository import ShareRepository
from app.storage.base import ObjectStorage
from app.storage.keys import is_owned_by, thumbnail_key
from app.utils.security import new_share_token

# A share can outlive any single presigned URL, so this is independent
# of PRESIGNED_URL_EXPIRE_SECONDS — a generous but bounded default,
# consistent with everything else in this app defaulting to "usable
# forever unless the owner says otherwise" rather than a hard cap.
DEFAULT_MAX_EXPIRES_DAYS = 3650


class ShareService:
    def __init__(self, shares: ShareRepository, items: ItemRepository, storage: ObjectStorage):
        self._shares = shares
        self._items = items
        self._storage = storage

    @staticmethod
    def _not_found() -> HTTPException:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found.")

    # --- owner-side ------------------------------------------------------

    async def create(
        self,
        user_id: str,
        item_id: str,
        *,
        recipient_emails: list[str],
        expires_in_days: int | None,
    ) -> Share:
        item = await self._items.get(user_id, item_id)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")

        expires_at = None
        if expires_in_days is not None:
            if not (1 <= expires_in_days <= DEFAULT_MAX_EXPIRES_DAYS):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"expires_in_days must be between 1 and {DEFAULT_MAX_EXPIRES_DAYS}.",
                )
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        # Normalized so "Alice@Example.com" and "alice@example.com" are
        # the same recipient — email comparison is case-insensitive.
        emails = sorted({e.strip().lower() for e in recipient_emails if e.strip()})

        return await self._shares.create(
            user_id, item_id, new_share_token(), recipient_emails=emails, expires_at=expires_at
        )

    async def list_mine(self, user_id: str) -> list[Share]:
        return await self._shares.list_by_owner(user_id)

    async def list_received(self, email: str) -> list[Share]:
        return await self._shares.list_received(email.strip().lower())

    async def revoke(self, user_id: str, share_id: str) -> None:
        ok = await self._shares.revoke(user_id, share_id)
        if not ok:
            raise self._not_found()

    async def item_for(self, share: Share) -> Item:
        item = await self._items.get(share.owner_id, share.item_id)
        if item is None:
            raise self._not_found()
        return item

    # --- visitor-side ------------------------------------------------------

    async def resolve(self, token: str, viewer_email: str | None) -> Share:
        share = await self._shares.get_by_token(token)
        if share is None or not share.is_active:
            raise self._not_found()
        if share.recipient_emails:
            if viewer_email is None or viewer_email.strip().lower() not in share.recipient_emails:
                # Same 404 as "doesn't exist" — a restricted share
                # should not confirm its own existence to the wrong
                # viewer any more than a missing one does.
                raise self._not_found()
        return share

    async def _assert_within_share(self, share: Share, item_id: str) -> Item:
        """The requested item must be the shared item itself or one of
        its descendants — walking up via parent_id, exactly like
        FileService._assert_no_cycle walks a folder move."""
        item = await self._items.get(share.owner_id, item_id)
        if item is None:
            raise self._not_found()
        cursor: str | None = item.id
        while cursor is not None:
            if cursor == share.item_id:
                return item
            node = await self._items.get(share.owner_id, cursor)
            cursor = node.parent_id if node else None
        raise self._not_found()

    async def browse(self, share: Share, parent_id: str | None) -> tuple[list[Item], int]:
        root = await self.item_for(share)
        if not root.is_folder:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="This share is a single file."
            )
        target = parent_id or root.id
        if target != root.id:
            await self._assert_within_share(share, target)
        return await self._items.list_children(share.owner_id, target, offset=0, limit=500, sort="name")

    async def download_url(self, share: Share, item_id: str) -> tuple[str, int]:
        item = await self._assert_within_share(share, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Folders cannot be downloaded."
            )
        if not is_owned_by(item.s3_key, share.owner_id):
            raise self._not_found()
        return (
            self._storage.download_url(item.s3_key, filename=item.name),
            settings.PRESIGNED_URL_EXPIRE_SECONDS,
        )

    async def thumbnail_url(self, share: Share, item_id: str) -> tuple[str, bool]:
        item = await self._assert_within_share(share, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not a file.")
        if not is_owned_by(item.s3_key, share.owner_id):
            raise self._not_found()
        thumb = thumbnail_key(item.s3_key)
        if self._storage.exists(thumb):
            return self._storage.download_url(thumb), True
        return self._storage.download_url(item.s3_key, filename=item.name), False
