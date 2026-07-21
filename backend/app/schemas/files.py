from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.item import Item, ItemType, UploadStatus

# Names become a segment of the S3 key, so they are validated here as well
# as in storage.keys — a bad name should be rejected at the edge with a
# 422 rather than surfacing as a storage-layer error.
_ILLEGAL_NAME_CHARS = {"/", "\\", "\x00"}
_RESERVED_NAMES = {".", ".."}


def _validate_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Name cannot be blank.")
    if cleaned in _RESERVED_NAMES:
        raise ValueError("Name is reserved.")
    if any(ch in cleaned for ch in _ILLEGAL_NAME_CHARS):
        raise ValueError("Name cannot contain '/', '\\' or null bytes.")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in cleaned):
        raise ValueError("Name cannot contain control characters.")
    return cleaned


class CreateFolderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return _validate_name(v)


class UploadUrlRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    parent_id: str | None = None
    content_type: str | None = Field(default=None, max_length=255)

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str) -> str:
        return _validate_name(v)


class UpdateItemRequest(BaseModel):
    """Rename and/or move. `parent_id` is only applied when explicitly sent,
    since null is itself meaningful (move to root)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str | None) -> str | None:
        return _validate_name(v) if v is not None else None


class ItemResponse(BaseModel):
    id: str
    name: str
    type: ItemType
    parent_id: str | None
    size: int | None
    content_type: str | None
    status: UploadStatus | None
    taken_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_item(cls, item: Item) -> "ItemResponse":
        # s3_key is deliberately omitted: clients never need it, and
        # exposing it leaks the internal layout of the bucket.
        return cls(
            id=item.id,
            name=item.name,
            type=item.type,
            parent_id=item.parent_id,
            size=item.size,
            content_type=item.content_type,
            status=item.status,
            taken_at=item.taken_at,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )


class UsageResponse(BaseModel):
    """Storage consumed by the requesting user.

    There is no quota: S3 bills per GB rather than capping. The client
    shows consumption and estimated cost instead of a fake limit.
    """

    bytes_stored: int
    file_count: int
    folder_count: int


class UploadUrlResponse(BaseModel):
    item: ItemResponse
    upload_url: str
    expires_in: int


class DownloadUrlResponse(BaseModel):
    download_url: str
    expires_in: int


class ThumbnailUrlResponse(BaseModel):
    url: str
    # False when no thumbnail exists yet and the original is served
    # instead, so the client can avoid caching it as a thumbnail.
    is_thumbnail: bool
    expires_in: int
