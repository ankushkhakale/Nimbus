from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr


class UserInDB(BaseModel):
    """Representation of a user document as stored in MongoDB."""

    id: str
    email: EmailStr
    full_name: str
    # None for accounts created purely through OAuth — they have no
    # password to hash. A password login against such an account fails
    # the same generic way as a wrong password, so it never reveals that
    # an address is OAuth-only.
    hashed_password: str | None = None
    # How this account can sign in: any of "password", "google",
    # "github". Link-by-email means one account can accumulate several.
    providers: list[str] = Field(default_factory=lambda: ["password"])
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def has_password(self) -> bool:
        return bool(self.hashed_password)
