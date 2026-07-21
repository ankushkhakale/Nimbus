from fastapi import HTTPException, status

from app.models.user import UserInDB
from app.repositories.user_repository import UserRepository
from app.utils.security import create_access_token, hash_password, verify_password


class AuthService:
    def __init__(self, user_repository: UserRepository):
        self._users = user_repository

    async def register(self, email: str, full_name: str, password: str) -> UserInDB:
        existing = await self._users.get_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists.",
            )
        return await self._users.create(email, full_name, hash_password(password))

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
