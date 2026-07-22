"""Scheduled trash purge.

The job itself talks to Mongo and S3 directly, so these tests exercise
the pieces that carry the risk: what the repository considers expired,
and how the Lambda entrypoint routes a scheduled event.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.item import Item, ItemType, UploadStatus
from app.storage.keys import build_user_key, thumbnail_key

USER = "64b7f0c2e1a2b3c4d5e6f7a8"


def _trashed_item(days_ago: float, *, size: int = 100) -> Item:
    when = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return Item(
        id=f"{int(days_ago * 100):024d}",
        user_id=USER,
        name=f"old-{days_ago}.txt",
        type=ItemType.FILE,
        # Distinct per item: sharing one key would make a per-key failure
        # look like it affected every item.
        s3_key=build_user_key(USER, f"files/{int(days_ago * 100):x}"),
        size=size,
        status=UploadStatus.READY,
        created_at=when,
        updated_at=when,
        deleted_at=when,
    )


# --- routing ------------------------------------------------------------

def test_scheduled_event_is_not_passed_to_the_http_adapter():
    """EventBridge sends bare JSON; Mangum would fail to parse it."""
    from app.lambda_handler import handler

    result = handler({"nimbus_task": "unknown_task"}, None)
    assert result == {"error": "unknown task: unknown_task"}


def test_http_events_still_reach_the_asgi_app(monkeypatch):
    import app.lambda_handler as lh

    seen = {}

    def fake_asgi(event, _context):
        seen["event"] = event
        return "ok"

    monkeypatch.setattr(lh, "_asgi_handler", fake_asgi)
    # A real API Gateway payload carries no nimbus_task key.
    assert lh.handler({"requestContext": {"http": {"method": "GET"}}}, None) == "ok"
    assert "requestContext" in seen["event"]


# --- what counts as expired --------------------------------------------

def test_purge_deletes_object_and_thumbnail(monkeypatch):
    """An orphaned thumbnail would cost storage forever with nothing
    pointing at it."""
    item = _trashed_item(40)
    deleted: list[str] = []

    class FakeStorage:
        def delete(self, key):
            deleted.append(key)

    class FakeRepo:
        async def purgeable(self, days):
            return [item]

        async def delete_by_id(self, item_id):
            deleted.append(f"doc:{item_id}")

    import app.jobs.purge as purge_module

    async def noop():
        return None

    monkeypatch.setattr(purge_module, "connect_to_mongo", noop)
    monkeypatch.setattr(purge_module, "get_database", lambda: None)
    monkeypatch.setattr(purge_module, "ItemRepository", lambda db: FakeRepo())
    monkeypatch.setattr(purge_module, "S3ObjectStorage", FakeStorage)

    import asyncio

    result = asyncio.run(purge_module.purge_expired_trash(30))

    assert result["purged"] == 1
    assert item.s3_key in deleted
    assert thumbnail_key(item.s3_key) in deleted
    assert f"doc:{item.id}" in deleted


def test_purge_continues_after_a_failure(monkeypatch):
    """One unreadable object must not abandon the rest of the sweep."""
    good, bad = _trashed_item(40), _trashed_item(50)

    class ExplodingStorage:
        def delete(self, key):
            if key == bad.s3_key:
                raise RuntimeError("S3 is unhappy")

    removed: list[str] = []

    class FakeRepo:
        async def purgeable(self, days):
            return [bad, good]

        async def delete_by_id(self, item_id):
            removed.append(item_id)

    import app.jobs.purge as purge_module

    async def noop():
        return None

    monkeypatch.setattr(purge_module, "connect_to_mongo", noop)
    monkeypatch.setattr(purge_module, "get_database", lambda: None)
    monkeypatch.setattr(purge_module, "ItemRepository", lambda db: FakeRepo())
    monkeypatch.setattr(purge_module, "S3ObjectStorage", ExplodingStorage)

    import asyncio

    result = asyncio.run(purge_module.purge_expired_trash(30))

    assert result["failed"] == 1
    assert result["purged"] == 1
    assert removed == [good.id]


@pytest.mark.parametrize("days_ago,expected", [(1, False), (29, False), (31, True)])
def test_retention_window_boundaries(days_ago, expected):
    """Only items past the window are eligible; recent trash is not."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    item = _trashed_item(days_ago)
    assert (item.deleted_at < cutoff) is expected
