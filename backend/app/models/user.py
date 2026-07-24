from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr

# A pure display denominator for the storage widget — S3 has no real quota
# and nothing enforces this, so it is deliberately editable rather than a
# plan tier. Defaults to 100GB, matching the ~90GB the project's own cost
# model is built around (requirements.md §3), rounded to a figure that
# reads naturally as "X GB of 100 GB used".
DEFAULT_STORAGE_QUOTA_BYTES = 100 * 1024**3


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
    # Cosmetic only — see DEFAULT_STORAGE_QUOTA_BYTES above. Renamed
    # clearly in the API as "display quota" so it is never mistaken for
    # an enforced cap.
    storage_quota_bytes: int = DEFAULT_STORAGE_QUOTA_BYTES
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def has_password(self) -> bool:
        return bool(self.hashed_password)
