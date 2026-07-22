"""File and folder business rules.

Storage keys are derived from a random UUID rather than the item's name
or path, so renaming or moving an item is a metadata-only update and
never requires copying objects in S3.

Deletion is soft: items move to a trash state and are purged later by a
scheduled job. Nothing in this service removes bytes from S3 except the
purge and an explicit permanent delete.
"""

import logging
from uuid import uuid4

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.item import Item, ItemType, UploadStatus
from app.repositories.item_repository import MAX_PAGE_SIZE, ItemRepository
from app.storage.base import ObjectStorage
from app.storage.keys import (
    InvalidObjectKey,
    build_user_key,
    is_owned_by,
    thumbnail_key,
)

logger = logging.getLogger(__name__)

# How long trashed items are recoverable before the purge removes them.
TRASH_RETENTION_DAYS = 30


class FileService:
    def __init__(self, items: ItemRepository, storage: ObjectStorage):
        self._items = items
        self._storage = storage

    # --- helpers -------------------------------------------------------

    @staticmethod
    def not_found() -> HTTPException:
        # Deliberately identical for "absent" and "owned by someone else",
        # so responses cannot be used to probe for other users' item ids.
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found.")

    # Internal alias kept so existing call sites read naturally.
    _not_found = not_found

    @staticmethod
    def _clamp(limit: int) -> int:
        return max(1, min(limit, MAX_PAGE_SIZE))

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

    async def _unique_name(self, user_id: str, parent_id: str | None, name: str) -> str:
        """Append " (2)", " (3)"… when the name is already taken.

        Mirrors what a desktop file manager does. Without it two uploads of
        the same filename silently produce two indistinguishable rows.
        """
        if not await self._items.name_exists(user_id, parent_id, name):
            return name

        stem, dot, ext = name.rpartition(".")
        base, suffix = (stem, f".{ext}") if dot else (name, "")

        for counter in range(2, 100):
            candidate = f"{base} ({counter}){suffix}"
            if not await self._items.name_exists(user_id, parent_id, candidate):
                return candidate
        # Astronomically unlikely; fall back to something certainly unique.
        return f"{base} ({uuid4().hex[:6]}){suffix}"

    # --- reads ---------------------------------------------------------

    async def list_children(
        self, user_id: str, parent_id: str | None, *, offset: int, limit: int, sort: str
    ) -> tuple[list[Item], int]:
        await self._validate_parent(user_id, parent_id)
        return await self._items.list_children(
            user_id, parent_id, offset=max(0, offset), limit=self._clamp(limit), sort=sort
        )

    async def list_photos(
        self, user_id: str, *, offset: int, limit: int
    ) -> tuple[list[Item], int]:
        return await self._items.list_images(
            user_id, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def search(
        self, user_id: str, term: str, *, offset: int, limit: int
    ) -> tuple[list[Item], int]:
        term = term.strip()
        if not term:
            return [], 0
        return await self._items.search(
            user_id, term, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def recent(self, user_id: str, *, limit: int = 20) -> list[Item]:
        return await self._items.list_recent(user_id, limit=self._clamp(limit))

    async def list_trash(self, user_id: str, *, offset: int, limit: int) -> tuple[list[Item], int]:
        return await self._items.list_trashed(
            user_id, offset=max(0, offset), limit=self._clamp(limit)
        )

    async def usage(self, user_id: str) -> tuple[int, int, int]:
        return await self._items.usage(user_id)

    async def usage_detail(self, user_id: str):
        stored, files, folders = await self._items.usage(user_id)
        by_category = await self._items.usage_by_category(user_id)
        trashed, _ = await self._items.list_trashed(user_id, offset=0, limit=MAX_PAGE_SIZE)
        trashed_bytes = sum(i.size or 0 for i in trashed)
        return stored, files, folders, len(trashed), trashed_bytes, by_category

    # --- creation ------------------------------------------------------

    async def create_folder(self, user_id: str, name: str, parent_id: str | None) -> Item:
        await self._validate_parent(user_id, parent_id)
        name = await self._unique_name(user_id, parent_id, name)
        return await self._items.create_folder(user_id, name, parent_id)

    async def start_upload(
        self, user_id: str, name: str, parent_id: str | None, content_type: str | None
    ) -> tuple[Item, str]:
        await self._validate_parent(user_id, parent_id)
        name = await self._unique_name(user_id, parent_id, name)
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

    # --- urls ----------------------------------------------------------

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

    async def preview_url(self, user_id: str, item_id: str) -> tuple[str, int]:
        """Signed URL rendered inline rather than downloaded.

        Same object as the download URL, minus the attachment disposition,
        so the browser displays images and PDFs in place.
        """
        item = await self._require_item(user_id, item_id)
        if item.is_folder or not item.s3_key or item.status is not UploadStatus.READY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item cannot be previewed."
            )
        if not is_owned_by(item.s3_key, user_id):
            raise self._not_found()
        return self._storage.download_url(item.s3_key), settings.PRESIGNED_URL_EXPIRE_SECONDS

    async def thumbnail_url(self, user_id: str, item_id: str) -> tuple[str, bool]:
        item = await self._require_item(user_id, item_id)
        return self._thumbnail_for(item, user_id)

    def _thumbnail_for(self, item: Item, user_id: str) -> tuple[str, bool]:
        if item.is_folder or not item.s3_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Item is not a file."
            )
        if not is_owned_by(item.s3_key, user_id):
            logger.error("Key %s is outside the prefix for user %s", item.s3_key, user_id)
            raise self._not_found()

        thumb = thumbnail_key(item.s3_key)
        if self._storage.exists(thumb):
            return self._storage.download_url(thumb), True
        return self._storage.download_url(item.s3_key, filename=item.name), False

    async def thumbnail_urls(
        self, user_id: str, item_ids: list[str]
    ) -> list[tuple[str, str, bool]]:
        """Sign many thumbnails in one request.

        Signing is local computation — no S3 round trip — so the only
        per-item cost is the existence check. Doing this in one call
        instead of one call per tile is the difference between a photo
        grid costing one Lambda invocation and costing hundreds.
        """
        out: list[tuple[str, str, bool]] = []
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id)
            if item is None or item.is_folder or not item.s3_key:
                continue
            try:
                url, is_thumb = self._thumbnail_for(item, user_id)
            except HTTPException:
                continue
            out.append((item_id, url, is_thumb))
        return out

    # --- mutation ------------------------------------------------------

    async def update(
        self, user_id: str, item_id: str, name: str | None, parent_id: str | None, move: bool
    ) -> Item:
        item = await self._require_item(user_id, item_id)
        if move:
            await self._validate_parent(user_id, parent_id)
            if item.is_folder:
                await self._assert_no_cycle(user_id, item_id, parent_id)
        if name is not None and name != item.name:
            target_parent = parent_id if move else item.parent_id
            name = await self._unique_name(user_id, target_parent, name)

        updated = await self._items.rename_or_move(
            user_id, item_id, name=name, parent_id=parent_id, move=move
        )
        if updated is None:  # pragma: no cover
            raise self._not_found()
        return updated

    async def move_many(self, user_id: str, item_ids: list[str], parent_id: str | None) -> int:
        await self._validate_parent(user_id, parent_id)
        moved = 0
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id)
            if item is None:
                continue
            if item.is_folder:
                # Skipped rather than aborting the batch: one invalid move
                # should not undo the others.
                try:
                    await self._assert_no_cycle(user_id, item_id, parent_id)
                except HTTPException:
                    continue
            name = await self._unique_name(user_id, parent_id, item.name)
            result = await self._items.rename_or_move(
                user_id, item_id, name=name, parent_id=parent_id, move=True
            )
            if result is not None:
                moved += 1
        return moved

    async def trash(self, user_id: str, item_ids: list[str]) -> int:
        """Move items (and folder contents) to the trash.

        Descendants are trashed too, otherwise they would be unreachable
        through the tree while still counting toward usage.
        """
        targets: list[str] = []
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id)
            if item is None:
                continue
            targets.append(item.id)
            if item.is_folder:
                targets.extend(d.id for d in await self._items.descendants(user_id, item.id))
        if not targets:
            return 0
        return await self._items.trash(user_id, list(dict.fromkeys(targets)))

    async def restore(self, user_id: str, item_ids: list[str]) -> int:
        return await self._items.restore(user_id, item_ids)

    async def delete_permanently(self, user_id: str, item_ids: list[str]) -> int:
        """Remove items and their bytes for good."""
        removed = 0
        for item_id in item_ids:
            item = await self._items.get(user_id, item_id, include_trashed=True)
            if item is None:
                continue
            self._remove_objects(item, user_id)
            if await self._items.hard_delete(user_id, item.id):
                removed += 1
        return removed

    def _remove_objects(self, item: Item, user_id: str) -> None:
        if not item.s3_key or not is_owned_by(item.s3_key, user_id):
            return
        try:
            self._storage.delete(item.s3_key)
            # Thumbnails live outside the user prefix, so nothing else
            # would ever collect them; an orphan sits in the bucket
            # costing money indefinitely. Delete is idempotent.
            self._storage.delete(thumbnail_key(item.s3_key))
        except Exception:
            logger.exception("Failed deleting objects for %s", item.s3_key)
