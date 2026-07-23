from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database.mongodb import get_database
from app.models.user import UserInDB
from app.repositories.item_repository import ItemRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from app.services.file_service import FileService
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
) -> FileService:
    return FileService(items, storage)


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
