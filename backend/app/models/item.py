"""Drive-style tree node: a file or a folder.

Files and folders share one collection because they share one namespace —
listing a directory, renaming, moving and deleting all then work off a
single query rather than being duplicated across two collections.
"""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class ItemType(str, Enum):
    FILE = "file"
    FOLDER = "folder"


class UploadStatus(str, Enum):
    # A presigned URL was issued but S3 has not confirmed the bytes yet.
    PENDING = "pending"
    # Upload verified against S3 (object exists, size recorded).
    READY = "ready"


class Item(BaseModel):
    id: str
    user_id: str
    name: str
    type: ItemType
    # None means the item sits at the root of the user's tree.
    parent_id: str | None = None

    # Files only.
    s3_key: str | None = None
    size: int | None = None
    content_type: str | None = None
    status: UploadStatus | None = None

    # Real capture time for photos, from EXIF or a Takeout sidecar — the
    # Photos-style date grid sorts on this, not on upload time.
    taken_at: datetime | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Set when the item is moved to Trash. Every normal query filters on
    # this being null, so deletion is reversible until the purge job runs.
    deleted_at: datetime | None = None
    # Where the item lived before deletion, so Restore can put it back
    # even if the user has since navigated elsewhere.
    deleted_from: str | None = None

    @property
    def is_folder(self) -> bool:
        return self.type is ItemType.FOLDER

    @property
    def is_trashed(self) -> bool:
        return self.deleted_at is not None
