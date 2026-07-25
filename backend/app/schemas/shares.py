from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.files import ItemResponse


class CreateShareRequest(BaseModel):
    item_id: str
    # Empty (the default) means a public link — anyone who has it can
    # view. Non-empty restricts access to those logged-in addresses.
    recipient_emails: list[EmailStr] = Field(default_factory=list, max_length=50)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class ShareResponse(BaseModel):
    """The owner's view of a share they created."""

    id: str
    item: ItemResponse
    token: str
    recipient_emails: list[str]
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    is_active: bool


class SharesResponse(BaseModel):
    shares: list[ShareResponse]


class ReceivedShareResponse(BaseModel):
    """A share addressed to the current user, as it appears in
    "Shared with me" — includes who shared it, since the recipient
    never sees the owner's other data."""

    id: str
    item: ItemResponse
    token: str
    owner_email: str
    expires_at: datetime | None
    created_at: datetime


class ReceivedSharesResponse(BaseModel):
    shares: list[ReceivedShareResponse]


class PublicShareResponse(BaseModel):
    """What an anonymous (or recipient-authenticated) visitor sees when
    they open a share link."""

    item: ItemResponse
    owner_name: str
    # Populated only when item.type == "folder" — its direct children,
    # for the initial view before any further browsing.
    children: list[ItemResponse] = Field(default_factory=list)
