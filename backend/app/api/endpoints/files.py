"""File and folder endpoints.

Every route resolves the caller through `get_current_user` and passes
that user's id into the service, so the JWT is what scopes all access —
no endpoint accepts a user id from the client.
"""

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import get_current_user, get_file_service
from app.core.config import settings
from app.models.user import UserInDB
from app.schemas.files import (
    CreateFolderRequest,
    DownloadUrlResponse,
    ItemResponse,
    UpdateItemRequest,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.services.file_service import FileService

router = APIRouter()


@router.get("", response_model=list[ItemResponse])
async def list_items(
    parent_id: str | None = Query(default=None, description="Folder to list; omit for root."),
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> list[ItemResponse]:
    items = await files.list_children(user.id, parent_id)
    return [ItemResponse.from_item(i) for i in items]


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


@router.patch("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_id: str,
    payload: UpdateItemRequest,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> ItemResponse:
    # parent_id=null means "move to root", so a move is only performed
    # when the client actually sent the field.
    move = "parent_id" in payload.model_fields_set
    item = await files.update(user.id, item_id, payload.name, payload.parent_id, move)
    return ItemResponse.from_item(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    item_id: str,
    user: UserInDB = Depends(get_current_user),
    files: FileService = Depends(get_file_service),
) -> Response:
    await files.delete(user.id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
