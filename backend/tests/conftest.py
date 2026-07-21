from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.api_router import api_router
from app.models.item import Item, ItemType, UploadStatus
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


class FakeItemRepository:
    """In-memory item store mirroring ItemRepository's contract.

    Notably it applies the same user_id filter on every read, so a test
    that loses isolation fails here exactly as it would against Mongo.
    """

    def __init__(self):
        self._items: dict[str, Item] = {}
        self._next = 1

    def _new_id(self) -> str:
        # Hex so it passes the ObjectId-shaped ids used elsewhere.
        item_id = f"{self._next:024x}"
        self._next += 1
        return item_id

    async def get(self, user_id: str, item_id: str) -> Item | None:
        item = self._items.get(item_id)
        return item if item and item.user_id == user_id else None

    async def list_children(self, user_id: str, parent_id: str | None) -> list[Item]:
        kids = [
            i for i in self._items.values()
            if i.user_id == user_id and i.parent_id == parent_id
        ]
        return sorted(kids, key=lambda i: (i.type is not ItemType.FOLDER, i.name))

    async def create_folder(self, user_id: str, name: str, parent_id: str | None) -> Item:
        item = Item(id=self._new_id(), user_id=user_id, name=name,
                    type=ItemType.FOLDER, parent_id=parent_id)
        self._items[item.id] = item
        return item

    async def create_pending_file(self, user_id, name, parent_id, s3_key, content_type) -> Item:
        item = Item(id=self._new_id(), user_id=user_id, name=name, type=ItemType.FILE,
                    parent_id=parent_id, s3_key=s3_key, content_type=content_type,
                    status=UploadStatus.PENDING)
        self._items[item.id] = item
        return item

    async def mark_ready(self, user_id: str, item_id: str, size: int) -> Item | None:
        item = await self.get(user_id, item_id)
        if item is None:
            return None
        updated = item.model_copy(update={"status": UploadStatus.READY, "size": size})
        self._items[item_id] = updated
        return updated

    async def rename_or_move(self, user_id, item_id, *, name, parent_id, move) -> Item | None:
        item = await self.get(user_id, item_id)
        if item is None:
            return None
        changes: dict = {}
        if name is not None:
            changes["name"] = name
        if move:
            changes["parent_id"] = parent_id
        updated = item.model_copy(update=changes)
        self._items[item_id] = updated
        return updated

    async def delete(self, user_id: str, item_id: str) -> bool:
        item = await self.get(user_id, item_id)
        if item is None:
            return False
        del self._items[item_id]
        return True

    async def usage(self, user_id: str) -> tuple[int, int, int]:
        mine = [i for i in self._items.values() if i.user_id == user_id]
        files = [i for i in mine if i.type is ItemType.FILE]
        folders = [i for i in mine if i.type is ItemType.FOLDER]
        return sum(i.size or 0 for i in files), len(files), len(folders)

    async def descendants(self, user_id: str, folder_id: str) -> list[Item]:
        found, frontier = [], [folder_id]
        while frontier:
            level = [i for i in self._items.values()
                     if i.user_id == user_id and i.parent_id in frontier]
            if not level:
                break
            found.extend(level)
            frontier = [i.id for i in level if i.is_folder]
        return found


class FakeStorage:
    """Object storage stub; `uploaded` stands in for what S3 holds."""

    def __init__(self):
        self.uploaded: dict[str, int] = {}
        self.deleted: list[str] = []

    def upload_url(self, key, *, content_type=None):
        return f"https://upload.test/{key}"

    def download_url(self, key, *, filename=None):
        return f"https://download.test/{key}?filename={filename}"

    def delete(self, key):
        self.deleted.append(key)
        self.uploaded.pop(key, None)

    def exists(self, key):
        return key in self.uploaded

    def size(self, key):
        return self.uploaded.get(key)


@pytest.fixture
def fake_user_repo() -> FakeUserRepository:
    return FakeUserRepository()


@pytest.fixture
def fake_item_repo() -> FakeItemRepository:
    return FakeItemRepository()


@pytest.fixture
def fake_storage() -> FakeStorage:
    return FakeStorage()


@pytest.fixture
def client(fake_user_repo, fake_item_repo, fake_storage) -> TestClient:
    app = FastAPI()
    app.include_router(api_router, prefix="/api/v1")
    app.dependency_overrides[deps.get_user_repository] = lambda: fake_user_repo
    app.dependency_overrides[deps.get_item_repository] = lambda: fake_item_repo
    app.dependency_overrides[deps.get_storage] = lambda: fake_storage
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers(client):
    """Register a user and return Authorization headers for them."""

    def _make(email="owner@example.com"):
        client.post("/api/v1/auth/register",
                    json={"email": email, "full_name": "Owner", "password": "password123"})
        token = client.post("/api/v1/auth/login",
                            json={"email": email, "password": "password123"}).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _make
