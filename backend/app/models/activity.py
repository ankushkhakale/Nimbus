"""A single entry in the user's activity feed — one thing that happened
to one of their items (uploaded, renamed, moved, trashed, restored,
deleted, a version restored, a share created).

Deliberately denormalized: `item_name` is snapshotted at record time so
the feed still reads sensibly after the item is renamed or deleted, and
the feed query never has to join back to the items collection.
"""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class Activity(BaseModel):
    id: str
    user_id: str
    # Free-form verb slug; the frontend maps it to an icon + phrasing.
    action: str
    item_name: str | None = None
    # Extra context, e.g. the destination folder name for a move, or the
    # new name for a rename.
    detail: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
