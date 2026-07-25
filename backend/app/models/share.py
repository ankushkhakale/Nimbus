"""A revocable link granting read-only access to one item (and, for a
folder, its subtree) without the visitor needing a Nimbus account —
unless `recipient_emails` is set, in which case the visitor must be
logged in with one of those addresses.

Deliberately not a permission on the item itself: a share is its own
document so one item can have several independent links (e.g. one
public, one for a specific person), each separately revocable, without
touching the item at all.
"""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class Share(BaseModel):
    id: str
    owner_id: str
    item_id: str

    # High-entropy opaque token — see utils.security.new_share_token.
    # Not hashed at rest: unlike a refresh token, the token IS the
    # access grant and is meant to be pasted into a browser, matching
    # how Drive/Dropbox links work. A leaked database dump exposing it
    # is no worse than the link itself leaking.
    token: str

    # Empty means anyone with the link can view it. Non-empty restricts
    # access to logged-in Nimbus users whose account email is listed.
    recipient_emails: list[str] = Field(default_factory=list)

    expires_at: datetime | None = None
    revoked_at: datetime | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None and self.expires_at <= datetime.now(timezone.utc):
            return False
        return True
