from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr


class UserInDB(BaseModel):
    """Representation of a user document as stored in MongoDB."""

    id: str
    email: EmailStr
    full_name: str
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
