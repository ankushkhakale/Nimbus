"""Share-link endpoints.

Owner-side routes (create, list mine, revoke, received) require login
like everything else in the app. The `/public/*` routes deliberately
do not — a share link's whole purpose is to work for someone without a
Nimbus account — but still accept an optional bearer token, since a
restricted (named-recipient) share needs to know who's asking.
"""

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_user, get_optional_user, get_share_service, get_user_repository
from app.core.config import settings
from app.models.user import UserInDB
from app.repositories.user_repository import UserRepository
from app.schemas.files import DownloadUrlResponse, ItemResponse, PageResponse, ThumbnailUrlResponse
from app.schemas.shares import (
    CreateShareRequest,
    PublicShareResponse,
    ReceivedShareResponse,
    ReceivedSharesResponse,
    ShareResponse,
    SharesResponse,
)
from app.services.share_service import ShareService

router = APIRouter()


async def _to_response(shares: ShareService, share) -> ShareResponse:
    item = await shares.item_for(share)
    return ShareResponse(
        id=share.id,
        item=ItemResponse.from_item(item),
        token=share.token,
        recipient_emails=share.recipient_emails,
        expires_at=share.expires_at,
        revoked_at=share.revoked_at,
        created_at=share.created_at,
        is_active=share.is_active,
    )


# --- owner-side ------------------------------------------------------------


@router.post("", response_model=ShareResponse, status_code=201)
async def create_share(
    payload: CreateShareRequest,
    user: UserInDB = Depends(get_current_user),
    shares: ShareService = Depends(get_share_service),
) -> ShareResponse:
    share = await shares.create(
        user.id,
        payload.item_id,
        recipient_emails=list(payload.recipient_emails),
        expires_in_days=payload.expires_in_days,
    )
    return await _to_response(shares, share)


@router.get("", response_model=SharesResponse)
async def list_my_shares(
    user: UserInDB = Depends(get_current_user),
    shares: ShareService = Depends(get_share_service),
) -> SharesResponse:
    mine = await shares.list_mine(user.id)
    return SharesResponse(shares=[await _to_response(shares, s) for s in mine])


@router.get("/received", response_model=ReceivedSharesResponse)
async def list_received_shares(
    user: UserInDB = Depends(get_current_user),
    shares: ShareService = Depends(get_share_service),
    users: UserRepository = Depends(get_user_repository),
) -> ReceivedSharesResponse:
    received = await shares.list_received(user.email)
    out = []
    for share in received:
        item = await shares.item_for(share)
        owner = await users.get_by_id(share.owner_id)
        out.append(
            ReceivedShareResponse(
                id=share.id,
                item=ItemResponse.from_item(item),
                token=share.token,
                owner_email=owner.email if owner else "unknown",
                expires_at=share.expires_at,
                created_at=share.created_at,
            )
        )
    return ReceivedSharesResponse(shares=out)


@router.delete("/{share_id}", status_code=204)
async def revoke_share(
    share_id: str,
    user: UserInDB = Depends(get_current_user),
    shares: ShareService = Depends(get_share_service),
) -> None:
    await shares.revoke(user.id, share_id)


# --- visitor-side ------------------------------------------------------------


@router.get("/public/{token}", response_model=PublicShareResponse)
async def open_share(
    token: str,
    viewer: UserInDB | None = Depends(get_optional_user),
    shares: ShareService = Depends(get_share_service),
    users: UserRepository = Depends(get_user_repository),
) -> PublicShareResponse:
    share = await shares.resolve(token, viewer.email if viewer else None)
    item = await shares.item_for(share)
    owner = await users.get_by_id(share.owner_id)
    children: list[ItemResponse] = []
    if item.is_folder:
        items, _ = await shares.browse(share, None)
        children = [ItemResponse.from_item(i) for i in items]
    return PublicShareResponse(
        item=ItemResponse.from_item(item),
        owner_name=owner.full_name if owner else "Nimbus user",
        children=children,
    )


@router.get("/public/{token}/browse", response_model=PageResponse)
async def browse_share(
    token: str,
    parent_id: str | None = Query(default=None),
    viewer: UserInDB | None = Depends(get_optional_user),
    shares: ShareService = Depends(get_share_service),
) -> PageResponse:
    share = await shares.resolve(token, viewer.email if viewer else None)
    items, total = await shares.browse(share, parent_id)
    return PageResponse(
        items=[ItemResponse.from_item(i) for i in items], total=total, offset=0, limit=len(items)
    )


@router.get("/public/{token}/download-url", response_model=DownloadUrlResponse)
async def share_download_url(
    token: str,
    item_id: str = Query(...),
    viewer: UserInDB | None = Depends(get_optional_user),
    shares: ShareService = Depends(get_share_service),
) -> DownloadUrlResponse:
    share = await shares.resolve(token, viewer.email if viewer else None)
    url, expires_in = await shares.download_url(share, item_id)
    return DownloadUrlResponse(download_url=url, expires_in=expires_in)


@router.get("/public/{token}/thumbnail-url", response_model=ThumbnailUrlResponse)
async def share_thumbnail_url(
    token: str,
    item_id: str = Query(...),
    viewer: UserInDB | None = Depends(get_optional_user),
    shares: ShareService = Depends(get_share_service),
) -> ThumbnailUrlResponse:
    share = await shares.resolve(token, viewer.email if viewer else None)
    url, is_thumb = await shares.thumbnail_url(share, item_id)
    return ThumbnailUrlResponse(
        url=url, is_thumbnail=is_thumb, expires_in=settings.PRESIGNED_URL_EXPIRE_SECONDS
    )
