"""A snapshot of a file's bytes at a point in time.

Versioning is application-level rather than S3 bucket versioning: each
version is its own object under the user's prefix, tracked by its own
document, so retention can be bounded (keep the last N) without relying
on a bucket-wide lifecycle policy. `s3_key` points at the snapshot's
own object, distinct from the item's current `s3_key`.
"""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class FileVersion(BaseModel):
    id: str
    user_id: str
    item_id: str

    # Monotonic per item, so the client can label "Version 3" stably even
    # after older versions age out of the retention window.
    version_number: int

    # The snapshot's own object — never the item's current key.
    s3_key: str
    size: int | None = None
    content_type: str | None = None
    # The item's name at snapshot time, shown in the history list. Purely
    # informational: restoring a version restores its bytes, not its name.
    name: str

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
