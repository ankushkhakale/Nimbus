from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.item import Item, ItemType, UploadStatus

# Names become a segment of the S3 key, so they are validated here as well
# as in storage.keys — a bad name should be rejected at the edge with a
# 422 rather than surfacing as a storage-layer error.
_ILLEGAL_NAME_CHARS = {"/", "\\", "\x00"}
_RESERVED_NAMES = {".", ".."}

# A fixed palette rather than a free-text color — this value goes straight
# into a client-side inline style, so accepting arbitrary strings would be
# a CSS-injection surface for no real benefit over a curated set.
ALLOWED_ITEM_COLORS = {"yellow", "blue", "green", "red", "purple", "pink", "gray"}


def _validate_color(value: str | None) -> str | None:
    if value is not None and value not in ALLOWED_ITEM_COLORS:
        raise ValueError(f"Color must be one of: {', '.join(sorted(ALLOWED_ITEM_COLORS))}.")
    return value


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
    """Rename, move, and/or recolor. `parent_id` and `color` are only
    applied when explicitly sent — for both, null is itself meaningful
    (move to root; clear the color), so "absent" and "sent as null" must
    stay distinguishable via `model_fields_set`."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    parent_id: str | None = None
    color: str | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v: str | None) -> str | None:
        return _validate_name(v) if v is not None else None

    @field_validator("color")
    @classmethod
    def check_color(cls, v: str | None) -> str | None:
        return _validate_color(v)


class ItemResponse(BaseModel):
    id: str
    name: str
    type: ItemType
    parent_id: str | None
    size: int | None
    content_type: str | None
    status: UploadStatus | None
    taken_at: datetime | None
    starred: bool
    color: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

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
            starred=item.starred,
            color=item.color,
            created_at=item.created_at,
            updated_at=item.updated_at,
            deleted_at=item.deleted_at,
        )


class PageResponse(BaseModel):
    """One page of items plus enough context to fetch the next.

    `total` lets the client show "1–100 of 4,312" and know when to stop;
    without it an infinite scroll cannot tell "empty page" from "end".
    """

    items: list[ItemResponse]
    total: int
    offset: int
    limit: int

    @property
    def has_more(self) -> bool:
        return self.offset + len(self.items) < self.total


class ItemGroup(BaseModel):
    """A cluster of visually-similar images — either near-duplicates or a
    photo stack, depending on which endpoint returned it."""

    items: list[ItemResponse]


class ItemGroupsResponse(BaseModel):
    groups: list[ItemGroup]


class BulkItemsRequest(BaseModel):
    # Bounded so one request cannot ask the server to walk an unbounded
    # number of subtrees.
    item_ids: list[str] = Field(min_length=1, max_length=500)


class MoveRequest(BaseModel):
    item_ids: list[str] = Field(min_length=1, max_length=500)
    parent_id: str | None = None


class BulkResultResponse(BaseModel):
    affected: int


class SignedUrl(BaseModel):
    item_id: str
    url: str
    is_thumbnail: bool


class SignedUrlsResponse(BaseModel):
    """Batch signing.

    The photo grid needs a URL per tile. Requesting them one at a time
    meant one Lambda invocation per photo, which at library scale burns
    the free tier in a few page views.
    """

    urls: list[SignedUrl]
    expires_in: int


class CategoryUsage(BaseModel):
    category: str
    bytes_stored: int
    file_count: int


class UsageDetailResponse(BaseModel):
    bytes_stored: int
    file_count: int
    folder_count: int
    trashed_count: int
    trashed_bytes: int
    by_category: list[CategoryUsage]


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
