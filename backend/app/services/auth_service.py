from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.models.user import UserInDB
from app.repositories.user_repository import UserRepository
from app.utils.security import create_access_token, hash_password, verify_password


class AuthService:
    def __init__(self, user_repository: UserRepository):
        self._users = user_repository

    _EMAIL_TAKEN = HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="An account with this email already exists.",
    )

    async def register(self, email: str, full_name: str, password: str) -> UserInDB:
        if await self._users.get_by_email(email):
            raise self._EMAIL_TAKEN
        try:
            return await self._users.create(email, full_name, hash_password(password))
        except DuplicateKeyError:
            # Lost a race against a concurrent registration for the same
            # email; the unique index is the real guard, so report the
            # same 409 rather than a 500.
            raise self._EMAIL_TAKEN

    async def authenticate(self, email: str, password: str) -> UserInDB:
        user = await self._users.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password.",
            )
        return user

    @staticmethod
    def issue_token(user: UserInDB) -> str:
        return create_access_token(subject=user.id)
