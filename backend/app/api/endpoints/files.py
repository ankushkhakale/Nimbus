"""File and folder endpoints.

Every route resolves the caller through `get_current_user` and passes
that user's id into the service, so the JWT is what scopes all access —
no endpoint accepts a user id from the client.

Fixed-path routes are declared before /{item_id} ones; otherwise the path
parameter swallows them.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import get_current_user, get_file_service
from app.core.config import settings
from app.models.user import UserInDB
from app.repositories.item_repository import DEFAULT_PAGE_SIZE, DEFAULT_SORT, SORT_SPECS
from app.schemas.files import (
    BulkItemsRequest,
    BulkResultResponse,
    CategoryUsage,
    CreateFolderRequest,
    DownloadUrlResponse,
    GeoPhoto,
    GeoPhotosResponse,
    ItemGroup,
    ItemGroupsResponse,
    ItemResponse,
    MoveRequest,
    PageResponse,
    SignedUrl,
    SignedUrlsResponse,
    ThumbnailUrlResponse,
    UpdateItemRequest,
    UploadUrlRequest,
    UploadUrlResponse,
    UsageDetailResponse,
    UsageResponse,
)
from app.services.file_service import FileService

router = APIRouter()


def _page(items, total, offset, limit) -> PageResponse:
    return PageResponse(
        items=[ItemResponse.from_item(i) for i in items],
        total=total,
        offset=offset,
        limit=limit,
    )


# --- listings ----------------------------------------------------------


@router.get("", response_model=PageResponse)
async def list_items(
    parent_id: str | None = Query(default=None, description="Folder to list; omit for root."),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=500),
    sort: str = Query(default=DEFAULT_SORT, description=f"One of: {', '.join(SORT_SPECS)}"),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> PageResponse:
    items, total = await files.list_children(
        user.id, parent_id, offset=offset, limit=limit, sort=sort
    )
    return _page(items, total, offset, limit)


@router.get("/photos", response_model=PageResponse)
async def list_photos(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=500),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> PageResponse:
    """Every image the user owns, newest first, across all folders.

    A photo library is organised by time rather than by folder, so this
    ignores the tree entirely.
    """
    items, total = await files.list_photos(user.id, offset=offset, limit=limit)
    return _page(items, total, offset, limit)


@router.get("/videos", response_model=PageResponse)
async def list_videos(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=500),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> PageResponse:
    """Every video the user owns, newest first, across all folders.

    Mirrors /photos: organised by time rather than by folder.
    """
    items, total = await files.list_videos(user.id, offset=offset, limit=limit)
    return _page(items, total, offset, limit)


@router.get("/search", response_model=PageResponse)
async def search_items(
    q: str = Query(min_length=1, max_length=200),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=500),
    item_type: str | None = Query(default=None, alias="type", pattern="^(file|folder)$"),
    category: str | None = Query(
        default=None, pattern="^(images|video|audio|documents|other)$"
    ),
    min_size: int | None = Query(default=None, ge=0),
    max_size: int | None = Query(default=None, ge=0),
    updated_after: datetime | None = Query(default=None),
    updated_before: datetime | None = Query(default=None),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> PageResponse:
    items, total = await files.search(
        user.id,
        q,
        offset=offset,
        limit=limit,
        item_type=item_type,
        category=category,
        min_size=min_size,
        max_size=max_size,
        updated_after=updated_after,
        updated_before=updated_before,
    )
    return _page(items, total, offset, limit)


@router.get("/recent", response_model=list[ItemResponse])
async def list_recent(
    limit: int = Query(default=20, ge=1, le=100),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> list[ItemResponse]:
    return [ItemResponse.from_item(i) for i in await files.recent(user.id, limit=limit)]


@router.get("/on-this-day", response_model=list[ItemResponse])
async def on_this_day(
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> list[ItemResponse]:
    """Photos taken on today's month and day in a previous year."""
    return [ItemResponse.from_item(i) for i in await files.on_this_day(user.id)]


@router.get("/starred", response_model=PageResponse)
async def list_starred(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=500),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> PageResponse:
    """Every starred item, file or folder, across all folders."""
    items, total = await files.list_starred(user.id, offset=offset, limit=limit)
    return _page(items, total, offset, limit)


@router.get("/duplicates", response_model=ItemGroupsResponse)
async def list_duplicates(
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ItemGroupsResponse:
    """Groups of images whose perceptual hashes are near-identical.

    Read-only — this only surfaces candidates for the user to review;
    nothing is deleted automatically.
    """
    groups = await files.find_duplicates(user.id)
    return ItemGroupsResponse(
        groups=[ItemGroup(items=[ItemResponse.from_item(i) for i in g]) for g in groups]
    )


@router.get("/photo-stacks", response_model=ItemGroupsResponse)
async def list_photo_stacks(
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ItemGroupsResponse:
    """Groups of visually-similar images taken close together in time —
    a burst of shots, rather than exact duplicates."""
    groups = await files.find_photo_stacks(user.id)
    return ItemGroupsResponse(
        groups=[ItemGroup(items=[ItemResponse.from_item(i) for i in g]) for g in groups]
    )


@router.get("/map-points", response_model=GeoPhotosResponse)
async def list_map_points(
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> GeoPhotosResponse:
    """Every geotagged photo the user owns, for the map view.

    Read-only, and silently skips anything without GPS EXIF — most
    photos have none, and that's expected rather than an error.
    """
    points = await files.geo_photos(user.id)
    return GeoPhotosResponse(
        photos=[GeoPhoto(item=ItemResponse.from_item(i), lat=lat, lon=lon) for i, lat, lon in points]
    )


@router.get("/trash", response_model=PageResponse)
async def list_trash(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=500),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> PageResponse:
    items, total = await files.list_trash(user.id, offset=offset, limit=limit)
    return _page(items, total, offset, limit)


# --- usage -------------------------------------------------------------


@router.get("/usage", response_model=UsageResponse)
async def read_usage(
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> UsageResponse:
    stored, file_count, folder_count = await files.usage(user.id)
    return UsageResponse(
        bytes_stored=stored, file_count=file_count, folder_count=folder_count
    )


@router.get("/usage/detail", response_model=UsageDetailResponse)
async def read_usage_detail(
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> UsageDetailResponse:
    stored, files_n, folders_n, trashed_n, trashed_bytes, by_category = await files.usage_detail(
        user.id
    )
    return UsageDetailResponse(
        bytes_stored=stored,
        file_count=files_n,
        folder_count=folders_n,
        trashed_count=trashed_n,
        trashed_bytes=trashed_bytes,
        by_category=[
            CategoryUsage(category=name, bytes_stored=b, file_count=c)
            for name, (b, c) in sorted(by_category.items(), key=lambda kv: -kv[1][0])
        ],
    )


# --- creation ----------------------------------------------------------


@router.post("/folders", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    payload: CreateFolderRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ItemResponse:
    item = await files.create_folder(user.id, payload.name, payload.parent_id)
    return ItemResponse.from_item(item)


@router.post("/upload-url", response_model=UploadUrlResponse, status_code=status.HTTP_201_CREATED)
async def request_upload_url(
    payload: UploadUrlRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> UploadUrlResponse:
    """Create a pending file and hand back a presigned PUT URL.

    The browser uploads straight to S3, then calls /complete so the size
    can be confirmed from S3 itself.
    """
    item, url = await files.start_upload(
        user.id, payload.name, payload.parent_id, payload.content_type
    )
    return UploadUrlResponse(
        item=ItemResponse.from_item(item),
        upload_url=url,
        expires_in=settings.PRESIGNED_URL_EXPIRE_SECONDS,
    )


# --- batch operations --------------------------------------------------


@router.post("/thumbnail-urls", response_model=SignedUrlsResponse)
async def request_thumbnail_urls(
    payload: BulkItemsRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> SignedUrlsResponse:
    """Sign a screenful of thumbnails in one request.

    Items that are missing or not the caller's are skipped rather than
    failing the batch, so one stale id cannot blank a whole grid.
    """
    signed = await files.thumbnail_urls(user.id, payload.item_ids)
    return SignedUrlsResponse(
        urls=[SignedUrl(item_id=i, url=u, is_thumbnail=t) for i, u, t in signed],
        expires_in=settings.PRESIGNED_URL_EXPIRE_SECONDS,
    )


@router.post("/move", response_model=BulkResultResponse)
async def move_items(
    payload: MoveRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> BulkResultResponse:
    return BulkResultResponse(
        affected=await files.move_many(user.id, payload.item_ids, payload.parent_id)
    )


@router.post("/star", response_model=BulkResultResponse)
async def star_items(
    payload: BulkItemsRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> BulkResultResponse:
    return BulkResultResponse(affected=await files.star(user.id, payload.item_ids))


@router.post("/unstar", response_model=BulkResultResponse)
async def unstar_items(
    payload: BulkItemsRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> BulkResultResponse:
    return BulkResultResponse(affected=await files.unstar(user.id, payload.item_ids))


@router.post("/trash", response_model=BulkResultResponse)
async def trash_items(
    payload: BulkItemsRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> BulkResultResponse:
    """Move items to the trash. Recoverable until the purge job runs."""
    return BulkResultResponse(affected=await files.trash(user.id, payload.item_ids))


@router.post("/restore", response_model=BulkResultResponse)
async def restore_items(
    payload: BulkItemsRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> BulkResultResponse:
    return BulkResultResponse(affected=await files.restore(user.id, payload.item_ids))


@router.post("/delete-permanently", response_model=BulkResultResponse)
async def delete_permanently(
    payload: BulkItemsRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> BulkResultResponse:
    """Irreversible: removes the metadata and the S3 objects."""
    return BulkResultResponse(
        affected=await files.delete_permanently(user.id, payload.item_ids)
    )


# --- per-item ----------------------------------------------------------


@router.post("/{item_id}/complete", response_model=ItemResponse)
async def complete_upload(
    item_id: str,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ItemResponse:
    item = await files.complete_upload(user.id, item_id)
    return ItemResponse.from_item(item)


@router.get("/{item_id}/download-url", response_model=DownloadUrlResponse)
async def request_download_url(
    item_id: str,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> DownloadUrlResponse:
    url, expires_in = await files.download_url(user.id, item_id)
    return DownloadUrlResponse(download_url=url, expires_in=expires_in)


@router.get("/{item_id}/preview-url", response_model=DownloadUrlResponse)
async def request_preview_url(
    item_id: str,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> DownloadUrlResponse:
    """Signed URL without an attachment disposition, for inline viewing."""
    url, expires_in = await files.preview_url(user.id, item_id)
    return DownloadUrlResponse(download_url=url, expires_in=expires_in)


@router.get("/{item_id}/thumbnail-url", response_model=ThumbnailUrlResponse)
async def request_thumbnail_url(
    item_id: str,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ThumbnailUrlResponse:
    url, is_thumbnail = await files.thumbnail_url(user.id, item_id)
    return ThumbnailUrlResponse(
        url=url, is_thumbnail=is_thumbnail, expires_in=settings.PRESIGNED_URL_EXPIRE_SECONDS
    )


@router.patch("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: str,
    payload: UpdateItemRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ItemResponse:
    # parent_id=null means "move to root", and color=null means "clear
    # it" — both only apply when the client actually sent the field.
    move = "parent_id" in payload.model_fields_set
    set_color = "color" in payload.model_fields_set
    item = await files.update(
        user.id,
        item_id,
        payload.name,
        payload.parent_id,
        move,
        set_color=set_color,
        color=payload.color,
    )
    return ItemResponse.from_item(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: str,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> Response:
    """Moves a single item to the trash — it is not destroyed here."""
    affected = await files.trash(user.id, [item_id])
    if affected == 0:
        # Missing and not-yours both land here, so this still cannot be
        # used to probe for another user's ids — but a caller that
        # deleted nothing must not be told it succeeded.
        raise FileService.not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
