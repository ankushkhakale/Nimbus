"""Scheduled cleanup of expired trash.

Trashed items stay recoverable for TRASH_RETENTION_DAYS, then this job
removes both the metadata and the S3 objects. Until it runs, deleted
files still occupy the bucket and still cost money — which is why the
usage endpoint reports trash separately rather than hiding it.

Runs cross-user by design: it is maintenance, not a request served on
anyone's behalf, so it deliberately does not go through FileService's
per-user scoping.
"""

import logging

from app.database.mongodb import connect_to_mongo, get_database
from app.repositories.item_repository import ItemRepository
from app.services.file_service import TRASH_RETENTION_DAYS
from app.storage.keys import is_owned_by, thumbnail_key
from app.storage.s3_storage import S3ObjectStorage

logger = logging.getLogger(__name__)


async def purge_expired_trash(retention_days: int = TRASH_RETENTION_DAYS) -> dict:
    """Delete trashed items past the retention window.

    Objects are removed before their metadata: if the process dies in
    between, the row remains and the next run retries it. The reverse
    order would drop the only pointer to the object, leaving bytes in the
    bucket that nothing can ever find or bill-account for.
    """
    await connect_to_mongo()
    items = ItemRepository(get_database())
    storage = S3ObjectStorage()

    expired = await items.purgeable(retention_days)
    logger.info("Purge: %d item(s) past %d-day retention", len(expired), retention_days)

    purged = 0
    failed = 0
    reclaimed = 0

    for item in expired:
        try:
            if item.s3_key and is_owned_by(item.s3_key, item.user_id):
                storage.delete(item.s3_key)
                storage.delete(thumbnail_key(item.s3_key))
                reclaimed += item.size or 0
            await items.delete_by_id(item.id)
            purged += 1
        except Exception:
            # One bad object must not stop the sweep; it will be retried
            # on the next run.
            failed += 1
            logger.exception("Purge failed for item %s", item.id)

    result = {"purged": purged, "failed": failed, "bytes_reclaimed": reclaimed}
    logger.info("Purge complete: %s", result)
    return result
