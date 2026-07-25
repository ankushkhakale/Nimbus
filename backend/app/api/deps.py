from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database.mongodb import get_database
from app.models.user import UserInDB
from app.repositories.item_repository import ItemRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.share_repository import ShareRepository
from app.repositories.user_repository import UserRepository
from app.repositories.version_repository import VersionRepository
from app.services.auth_service import AuthService
from app.services.file_service import FileService
from app.services.share_service import ShareService
from app.storage.base import ObjectStorage
from app.storage.s3_storage import S3ObjectStorage
from app.utils.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


def get_user_repository(db: AsyncIOMotorDatabase = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


def get_refresh_token_repository(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> RefreshTokenRepository:
    return RefreshTokenRepository(db)


def get_auth_service(
    user_repo: UserRepository = Depends(get_user_repository),
    refresh_repo: RefreshTokenRepository = Depends(get_refresh_token_repository),
) -> AuthService:
    return AuthService(user_repo, refresh_repo)


def get_item_repository(db: AsyncIOMotorDatabase = Depends(get_db)) -> ItemRepository:
    return ItemRepository(db)


def get_version_repository(db: AsyncIOMotorDatabase = Depends(get_db)) -> VersionRepository:
    return VersionRepository(db)


# Built once per process, not per request: boto3 clients are thread-safe
# and creating one costs an expensive session/credential resolution that
# would otherwise repeat on every call.
_storage_singleton: ObjectStorage | None = None


def get_storage() -> ObjectStorage:
    global _storage_singleton
    if _storage_singleton is None:
        _storage_singleton = S3ObjectStorage()
    return _storage_singleton


def get_file_service(
    items: ItemRepository = Depends(get_item_repository),
    storage: ObjectStorage = Depends(get_storage),
    versions: VersionRepository = Depends(get_version_repository),
) -> FileService:
    return FileService(items, storage, versions)


def get_share_repository(db: AsyncIOMotorDatabase = Depends(get_db)) -> ShareRepository:
    return ShareRepository(db)


def get_share_service(
    shares: ShareRepository = Depends(get_share_repository),
    items: ItemRepository = Depends(get_item_repository),
    storage: ObjectStorage = Depends(get_storage),
) -> ShareService:
    return ShareService(shares, items, storage)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_repo: UserRepository = Depends(get_user_repository),
) -> UserInDB:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        raise unauthorized

    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise unauthorized

    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    user_repo: UserRepository = Depends(get_user_repository),
) -> UserInDB | None:
    """Same as get_current_user, but permissive: used by the public share
    endpoints, which must work with no token at all and only need to
    know *who* the caller is when a restricted share checks their email.
    An invalid/expired token is treated the same as no token, rather
    than rejecting the request outright — the share resolution itself
    is what decides access."""
    if credentials is None:
        return None
    user_id = decode_access_token(credentials.credentials)
    if user_id is None:
        return None
    return await user_repo.get_by_id(user_id)
