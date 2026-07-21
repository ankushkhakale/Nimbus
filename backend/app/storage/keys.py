"""Per-user S3 key construction and validation.

Multi-user isolation depends on every object living under
``users/{user_id}/`` and on no client-supplied path being able to escape
that prefix. This module is the single place that guarantees it — the
service layer must never concatenate keys by hand.
"""

# S3 keys are limited to 1024 bytes; leave headroom for the user prefix.
MAX_RELATIVE_PATH_BYTES = 900

# Segments that would escape or confuse the prefix.
_FORBIDDEN_SEGMENTS = {"", ".", ".."}


class InvalidObjectKey(ValueError):
    """Raised when a client-supplied path is unsafe or malformed."""


def user_prefix(user_id: str) -> str:
    if not user_id or "/" in user_id:
        raise InvalidObjectKey("Invalid user id.")
    return f"users/{user_id}/"


def build_user_key(user_id: str, relative_path: str) -> str:
    """Return the full S3 key for a user's file, or raise InvalidObjectKey.

    Rejects absolute paths, traversal (``..``), empty/dot segments,
    backslashes, and control characters — so the result is always inside
    ``users/{user_id}/``.
    """
    if not isinstance(relative_path, str) or not relative_path:
        raise InvalidObjectKey("Path must be a non-empty string.")

    if len(relative_path.encode("utf-8")) > MAX_RELATIVE_PATH_BYTES:
        raise InvalidObjectKey("Path is too long.")

    # Backslashes are rejected outright rather than normalised: treating
    # them as separators varies by platform and invites bypasses.
    if "\\" in relative_path:
        raise InvalidObjectKey("Backslashes are not allowed in paths.")

    if relative_path.startswith("/"):
        raise InvalidObjectKey("Path must be relative.")

    if any(ord(ch) < 32 or ord(ch) == 127 for ch in relative_path):
        raise InvalidObjectKey("Path contains control characters.")

    segments = relative_path.split("/")
    for segment in segments:
        if segment in _FORBIDDEN_SEGMENTS:
            raise InvalidObjectKey(f"Illegal path segment: {segment!r}")

    return user_prefix(user_id) + "/".join(segments)


THUMBNAIL_PREFIX = "thumbnails/"


def thumbnail_key(object_key: str) -> str:
    """Map an object key to where its thumbnail lives.

    ``users/{uid}/files/{uuid}`` -> ``thumbnails/{uid}/files/{uuid}.jpg``

    Deriving this instead of storing it keeps the thumbnail Lambda free of
    any database access — it can compute the destination from the event
    alone. The separate top-level prefix is what stops the generated
    thumbnail re-triggering the ObjectCreated notification that made it.
    """
    if not object_key.startswith("users/"):
        raise InvalidObjectKey("Only user objects have thumbnails.")
    return f"{THUMBNAIL_PREFIX}{object_key[len('users/'):]}.jpg"


def is_owned_by(key: str, user_id: str) -> bool:
    """True if `key` lies within `user_id`'s prefix.

    Defence in depth: callers that receive a stored key still verify
    ownership before issuing a presigned URL for it.
    """
    return key.startswith(user_prefix(user_id))
