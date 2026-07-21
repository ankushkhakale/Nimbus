from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.api_router import api_router
from app.models.user import UserInDB


class FakeUserRepository:
    """In-memory stand-in for UserRepository, so auth tests don't need Mongo."""

    def __init__(self):
        self._by_id: dict[str, UserInDB] = {}
        self._next_id = 1

    async def get_by_email(self, email: str) -> UserInDB | None:
        return next((u for u in self._by_id.values() if u.email == email), None)

    async def get_by_id(self, user_id: str) -> UserInDB | None:
        return self._by_id.get(user_id)

    async def create(self, email: str, full_name: str, hashed_password: str) -> UserInDB:
        user_id = str(self._next_id)
        self._next_id += 1
        user = UserInDB(
            id=user_id,
            email=email,
            full_name=full_name,
            hashed_password=hashed_password,
            created_at=datetime.now(timezone.utc),
        )
        self._by_id[user_id] = user
        return user


@pytest.fixture
def fake_user_repo() -> FakeUserRepository:
    return FakeUserRepository()


@pytest.fixture
def client(fake_user_repo: FakeUserRepository) -> TestClient:
    app = FastAPI()
    app.include_router(api_router, prefix="/api/v1")
    app.dependency_overrides[deps.get_user_repository] = lambda: fake_user_repo
    with TestClient(app) as test_client:
        yield test_client
