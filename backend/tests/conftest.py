import re
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.api_router import api_router
from app.models.item import Item, ItemType, UploadStatus
from app.models.user import UserInDB


def _category_of(content_type: str | None) -> str:
    """Mirrors CATEGORY_REGEX in item_repository.py."""
    ct = content_type or ""
    if ct.startswith("image/"):
        return "images"
    if ct.startswith("video/"):
        return "video"
    if ct.startswith("audio/"):
        return "audio"
    if re.search("pdf|document|text|spreadsheet|presentation", ct):
        return "documents"
    return "other"


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
        return self._insert(email, full_name, hashed_password, ["password"])

    async def create_oauth_user(self, email: str, full_name: str, provider: str) -> UserInDB:
        return self._insert(email, full_name, None, [provider])

    async def add_provider(self, user_id: str, provider: str) -> None:
        user = self._by_id.get(user_id)
        if user and provider not in user.providers:
            self._by_id[user_id] = user.model_copy(
                update={"providers": [*user.providers, provider]}
            )

    async def update_profile(
        self, user_id: str, *, full_name: str | None, storage_quota_bytes: int | None
    ) -> UserInDB | None:
        user = self._by_id.get(user_id)
        if user is None:
            return None
        changes = {}
        if full_name is not None:
            changes["full_name"] = full_name
        if storage_quota_bytes is not None:
            changes["storage_quota_bytes"] = storage_quota_bytes
        updated = user.model_copy(update=changes)
        self._by_id[user_id] = updated
        return updated

    async def update_password(self, user_id: str, hashed_password: str) -> None:
        user = self._by_id.get(user_id)
        if user is None:
            return
        self._by_id[user_id] = user.model_copy(
            update={
                "hashed_password": hashed_password,
                "providers": user.providers if "password" in user.providers
                else [*user.providers, "password"],
            }
        )

    def _insert(self, email, full_name, hashed_password, providers) -> UserInDB:
        user_id = str(self._next_id)
        self._next_id += 1
        user = UserInDB(
            id=user_id,
            email=email,
            full_name=full_name,
            hashed_password=hashed_password,
            providers=providers,
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

    def _mine(self, user_id: str, *, trashed: bool = False) -> list[Item]:
        return [
            i for i in self._items.values()
            if i.user_id == user_id and (i.deleted_at is not None) == trashed
        ]

    async def get(self, user_id: str, item_id: str, *, include_trashed: bool = False) -> Item | None:
        item = self._items.get(item_id)
        if not item or item.user_id != user_id:
            return None
        if item.deleted_at is not None and not include_trashed:
            return None
        return item

    async def list_children(
        self,
        user_id: str,
        parent_id: str | None,
        *,
        offset: int = 0,
        limit: int = 100,
        sort: str = "name",
    ) -> tuple[list[Item], int]:
        kids = [i for i in self._mine(user_id) if i.parent_id == parent_id]
        reverse = sort.endswith("_desc")
        if sort.startswith("size"):
            kids.sort(key=lambda i: (i.type is not ItemType.FOLDER, -(i.size or 0)))
        elif sort.startswith("updated"):
            kids.sort(key=lambda i: (i.type is not ItemType.FOLDER, i.updated_at), reverse=reverse)
        else:
            kids.sort(key=lambda i: (i.type is not ItemType.FOLDER, i.name.lower()), reverse=reverse)
        return kids[offset : offset + limit], len(kids)

    async def list_images(
        self, user_id: str, *, offset: int = 0, limit: int = 100
    ) -> tuple[list[Item], int]:
        imgs = [
            i for i in self._mine(user_id)
            if i.type is ItemType.FILE
            and i.status is UploadStatus.READY
            and (i.content_type or "").startswith("image/")
        ]
        imgs.sort(key=lambda i: i.taken_at or i.created_at, reverse=True)
        return imgs[offset : offset + limit], len(imgs)

    async def list_videos(
        self, user_id: str, *, offset: int = 0, limit: int = 100
    ) -> tuple[list[Item], int]:
        vids = [
            i for i in self._mine(user_id)
            if i.type is ItemType.FILE
            and i.status is UploadStatus.READY
            and (i.content_type or "").startswith("video/")
        ]
        vids.sort(key=lambda i: i.taken_at or i.created_at, reverse=True)
        return vids[offset : offset + limit], len(vids)

    async def search(
        self,
        user_id: str,
        term: str,
        *,
        offset: int = 0,
        limit: int = 100,
        item_type: str | None = None,
        category: str | None = None,
        min_size: int | None = None,
        max_size: int | None = None,
        updated_after=None,
        updated_before=None,
    ) -> tuple[list[Item], int]:
        import re

        hits = [
            i for i in self._mine(user_id)
            if re.search(re.escape(term), i.name, re.IGNORECASE)
        ]
        if item_type is not None:
            hits = [i for i in hits if i.type.value == item_type]
        if category is not None:
            hits = [i for i in hits if _category_of(i.content_type) == category]
        if min_size is not None:
            hits = [i for i in hits if (i.size or 0) >= min_size]
        if max_size is not None:
            hits = [i for i in hits if (i.size or 0) <= max_size]
        if updated_after is not None:
            hits = [i for i in hits if i.updated_at >= updated_after]
        if updated_before is not None:
            hits = [i for i in hits if i.updated_at <= updated_before]
        hits.sort(key=lambda i: (i.type is not ItemType.FOLDER, i.name.lower()))
        return hits[offset : offset + limit], len(hits)

    async def list_recent(self, user_id: str, *, limit: int = 20) -> list[Item]:
        files = [
            i for i in self._mine(user_id)
            if i.type is ItemType.FILE and i.status is UploadStatus.READY
        ]
        files.sort(key=lambda i: i.updated_at, reverse=True)
        return files[:limit]

    async def on_this_day(self, user_id: str) -> list[Item]:
        today = datetime.now(timezone.utc)
        imgs = [
            i for i in self._mine(user_id)
            if i.type is ItemType.FILE
            and i.status is UploadStatus.READY
            and (i.content_type or "").startswith("image/")
            and i.taken_at is not None
            and i.taken_at.month == today.month
            and i.taken_at.day == today.day
            and i.taken_at.year != today.year
        ]
        imgs.sort(key=lambda i: i.taken_at, reverse=True)
        return imgs

    async def list_trashed(
        self, user_id: str, *, offset: int = 0, limit: int = 100
    ) -> tuple[list[Item], int]:
        gone = self._mine(user_id, trashed=True)
        gone.sort(key=lambda i: i.deleted_at or i.updated_at, reverse=True)
        return gone[offset : offset + limit], len(gone)

    async def name_exists(self, user_id: str, parent_id: str | None, name: str) -> bool:
        return any(
            i.parent_id == parent_id and i.name == name for i in self._mine(user_id)
        )

    async def trash(self, user_id: str, item_ids: list[str]) -> int:
        now = datetime.now(timezone.utc)
        count = 0
        for item_id in item_ids:
            item = await self.get(user_id, item_id)
            if item is None:
                continue
            self._items[item_id] = item.model_copy(
                update={"deleted_at": now, "deleted_from": item.parent_id}
            )
            count += 1
        return count

    async def restore(self, user_id: str, item_ids: list[str]) -> int:
        count = 0
        for item_id in item_ids:
            item = await self.get(user_id, item_id, include_trashed=True)
            if item is None or item.deleted_at is None:
                continue
            target = item.deleted_from
            if target is not None:
                parent = self._items.get(target)
                if parent is None or parent.deleted_at is not None:
                    target = None
            self._items[item_id] = item.model_copy(
                update={"deleted_at": None, "deleted_from": None, "parent_id": target}
            )
            count += 1
        return count

    async def hard_delete(self, user_id: str, item_id: str) -> bool:
        item = self._items.get(item_id)
        if item is None or item.user_id != user_id:
            return False
        del self._items[item_id]
        return True

    async def usage_by_category(self, user_id: str) -> dict[str, tuple[int, int]]:
        out: dict[str, tuple[int, int]] = {}
        for i in self._mine(user_id):
            if i.type is not ItemType.FILE:
                continue
            ct = i.content_type or ""
            key = (
                "images" if ct.startswith("image/")
                else "video" if ct.startswith("video/")
                else "audio" if ct.startswith("audio/")
                else "documents" if any(t in ct for t in ("pdf", "document", "text"))
                else "other"
            )
            b, c = out.get(key, (0, 0))
            out[key] = (b + (i.size or 0), c + 1)
        return out

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

    async def rename_or_move(
        self, user_id, item_id, *, name, parent_id, move, set_color=False, color=None
    ) -> Item | None:
        item = await self.get(user_id, item_id)
        if item is None:
            return None
        changes: dict = {}
        if name is not None:
            changes["name"] = name
        if move:
            changes["parent_id"] = parent_id
        if set_color:
            changes["color"] = color
        updated = item.model_copy(update=changes)
        self._items[item_id] = updated
        return updated

    async def set_starred(self, user_id: str, item_ids: list[str], starred: bool) -> int:
        count = 0
        for item_id in item_ids:
            item = await self.get(user_id, item_id)
            if item is None:
                continue
            self._items[item_id] = item.model_copy(update={"starred": starred})
            count += 1
        return count

    async def list_starred(
        self, user_id: str, *, offset: int = 0, limit: int = 100
    ) -> tuple[list[Item], int]:
        starred = [i for i in self._mine(user_id) if i.starred]
        starred.sort(key=lambda i: i.updated_at, reverse=True)
        return starred[offset : offset + limit], len(starred)

    async def usage(self, user_id: str) -> tuple[int, int, int]:
        mine = self._mine(user_id)
        files = [i for i in mine if i.type is ItemType.FILE]
        folders = [i for i in mine if i.type is ItemType.FOLDER]
        return sum(i.size or 0 for i in files), len(files), len(folders)

    async def descendants(
        self, user_id: str, folder_id: str, *, include_trashed: bool = False
    ) -> list[Item]:
        found, frontier = [], [folder_id]
        while frontier:
            level = [
                i for i in self._items.values()
                if i.user_id == user_id
                and i.parent_id in frontier
                and (include_trashed or i.deleted_at is None)
            ]
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
        # Mirrors S3ObjectStorage: the disposition is only attached when a
        # filename is supplied, which is what distinguishes a download URL
        # from an inline preview URL.
        return (
            f"https://download.test/{key}?filename={filename}"
            if filename
            else f"https://download.test/{key}"
        )

    def delete(self, key):
        self.deleted.append(key)
        self.uploaded.pop(key, None)

    def exists(self, key):
        return key in self.uploaded

    def size(self, key):
        return self.uploaded.get(key)


class FakeRefreshTokenRepository:
    """In-memory refresh-token store mirroring the real contract."""

    def __init__(self):
        self.rows: dict[str, dict] = {}

    async def create(self, user_id: str, token_hash: str, expires_at) -> None:
        self.rows[token_hash] = {
            "user_id": user_id,
            "token_hash": token_hash,
            "expires_at": expires_at,
            "used_at": None,
        }

    async def find(self, token_hash: str) -> dict | None:
        return self.rows.get(token_hash)

    async def mark_used(self, token_hash: str) -> bool:
        row = self.rows.get(token_hash)
        if row is None or row["used_at"] is not None:
            return False
        row["used_at"] = datetime.now(timezone.utc)
        return True

    async def revoke(self, token_hash: str) -> None:
        self.rows.pop(token_hash, None)

    async def revoke_all_for_user(self, user_id: str) -> int:
        doomed = [h for h, r in self.rows.items() if r["user_id"] == user_id]
        for h in doomed:
            del self.rows[h]
        return len(doomed)


@pytest.fixture
def fake_refresh_repo() -> FakeRefreshTokenRepository:
    return FakeRefreshTokenRepository()


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
def client(fake_user_repo, fake_item_repo, fake_storage, fake_refresh_repo) -> TestClient:
    app = FastAPI()
    app.include_router(api_router, prefix="/api/v1")
    app.dependency_overrides[deps.get_user_repository] = lambda: fake_user_repo
    app.dependency_overrides[deps.get_refresh_token_repository] = lambda: fake_refresh_repo
    app.dependency_overrides[deps.get_item_repository] = lambda: fake_item_repo
    app.dependency_overrides[deps.get_storage] = lambda: fake_storage
    # https, not http: the refresh cookie is set Secure, and a client
    # correctly refuses to send Secure cookies over plain HTTP. Testing
    # against http would mean either missing the cookie entirely or
    # weakening the cookie to suit the test.
    with TestClient(app, base_url="https://testserver") as test_client:
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
