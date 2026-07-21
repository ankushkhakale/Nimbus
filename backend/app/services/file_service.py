"""File and folder business rules.

Storage keys are derived from a random UUID rather than the item's name
or path, so renaming or moving an item is a metadata-only update and
never requires copying objects in S3.
"""

import logging
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.item import Item, ItemType, UploadStatus
from app.repositories.item_repository import ItemRepository
from app.storage.base import ObjectStorage
from app.storage.keys import InvalidObjectKey, build_user_key, is_owned_by

logger = logging.getLogger(__name__)


class FileService:
    def __init__(self, items: ItemRepository, storage: ObjectStorage):
        self._items = items
        self._storage = storage

    # --- helpers -------------------------------------------------------

    @staticmethod
    def _not_found() -> HTTPException:
        # Deliberately identical for "absent" and "owned by someone else",
        # so responses cannot be used to probe for other users' item ids.
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")

    async def _require_item(self, user_id: str, item_id: str) -> Item:
        item = await self._items.get(user_id, item_id)
        if item is None:
            raise self._not_found()
        return item

    async def _validate_parent(self, user_id: str, parent_id: str | None) -> None:
        if parent_id is None:
            return
        parent = await self._items.get(user_id, parent_id)
        if parent is None:
            raise self._not_found()
        if not parent.is_folder:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent must be a folder.",
            )

    async def _assert_no_cycle(self, user_id: str, folder_id: str, target_parent: str | None):
        """Reject moving a folder inside itself or its own descendants.

        Without this the subtree is orphaned: it disappears from the tree
        while its documents still exist, and listing never reaches it.
        """
        cursor = target_parent
        while cursor is not None:
            if cursor == folder_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot move a folder into itself or its own subfolder.",
                )
            node = await self._items.get(user_id, cursor)
            if node is None:
                break
            cursor = node.parent_id

    # --- operations ----------------------------------------------------

    async def list_children(self, user_id: str, parent_id: str | None) -> list[Item]:
        await self._validate_parent(user_id, parent_id)
        return await self._items.list_children(user_id, parent_id)

    async def usage(self, user_id: str) -> tuple[int, int, int]:
        return await self._items.usage(user_id)

    async def create_folder(self, user_id: str, name: str, parent_id: str | None) -> Item:
        await self._validate_parent(user_id, parent_id)
        return await self._items.create_folder(user_id, name, parent_id)

    async def start_upload(
        self, user_id: str, name: str, parent_id: str | None, content_type: str | None
    ) -> tuple[Item, str]:
        await self._validate_parent(user_id, parent_id)
        try:
            key = build_user_key(user_id, f"files/{uuid4().hex}")
        except InvalidObjectKey as exc:  # pragma: no cover - defensive
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

        item = await self._items.create_pending_file(user_id, name, parent_id, key, content_type)
        url = self._storage.upload_url(key, content_type=content_type)
        return item, url

    async def complete_upload(self, user_id: str, item_id: str) -> Item:
        """Confirm an upload by checking S3 directly.

        The size is read from S3 rather than taken from the client, so a
        caller cannot under-report usage or mark a file ready that was
        never actually uploaded.
        """
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not an uploadable file."
            )

        size = self._storage.size(item.s3_key)
        if size is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No uploaded object found for this item yet.",
            )

        updated = await self._items.mark_ready(user_id, item_id, size)
        if updated is None:  # pragma: no cover - lost a concurrent delete
            raise self._not_found()
        return updated

    async def download_url(self, user_id: str, item_id: str) -> tuple[str, int]:
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Folders cannot be downloaded."
            )
        if item.status is not UploadStatus.READY:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Upload has not completed."
            )
        # Defence in depth: the key came from our own database, but verify
        # it still falls inside this user's prefix before signing it.
        if not is_owned_by(item.s3_key, user_id):
            logger.error("Key %s is outside the prefix for user %s", item.s3_key, user_id)
            raise self._not_found()
        return self._storage.download_url(item.s3_key, filename=item.name), (
            settings.PRESIGNED_URL_EXPIRE_SECONDS
        )

    async def update(
        self, user_id: str, item_id: str, name: str | None, parent_id: str | None, move: bool
    ) -> Item:
        item = await self._require_item(user_id, item_id)
        if move:
            await self._validate_parent(user_id, parent_id)
            if item.is_folder:
                await self._assert_no_cycle(user_id, item_id, parent_id)
        updated = await self._items.rename_or_move(
            user_id, item_id, name=name, parent_id=parent_id, move=move
        )
        if updated is None:  # pragma: no cover
            raise self._not_found()
        return updated

    async def delete(self, user_id: str, item_id: str) -> None:
        item = await self._require_item(user_id, item_id)

        doomed = [item]
        if item.is_folder:
            doomed.extend(await self._items.descendants(user_id, item_id))

        # Remove the bytes first. If a later step fails the object is gone
        # but the row remains, which is recoverable; the reverse would
        # leave orphaned objects silently accruing storage cost.
        for node in doomed:
            if node.s3_key and is_owned_by(node.s3_key, user_id):
                try:
                    self._storage.delete(node.s3_key)
                except Exception:
                    logger.exception("Failed deleting object %s", node.s3_key)

        for node in doomed:
            await self._items.delete(user_id, node.id)
