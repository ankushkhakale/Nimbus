from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=72)  # bcrypt's hard input limit is 72 bytes


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class OAuthCallbackRequest(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    # The exact redirect_uri the browser used, echoed so the provider's
    # token exchange matches. Validated against the allowed origins.
    redirect_uri: str = Field(min_length=1, max_length=512)


class AuthConfigResponse(BaseModel):
    """Public, unauthenticated: tells the frontend which OAuth buttons to
    show. Contains only the enabled provider names, never any secret."""

    providers: list[str]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    providers: list[str]
    has_password: bool
    storage_quota_bytes: int


class UpdateProfileRequest(BaseModel):
    """Both fields optional: send only what changed."""

    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    # Bounded so the display denominator can't be set to something
    # nonsensical (zero, negative, or absurdly large); still purely
    # cosmetic — nothing enforces it against actual S3 usage.
    storage_quota_bytes: int | None = Field(default=None, ge=1024**3, le=1024**5)


class ChangePasswordRequest(BaseModel):
    # Optional: accounts created purely via OAuth have no current password
    # to check, so setting one for the first time supplies only the new
    # one. An account that already has a password must supply it — the
    # endpoint enforces that, not this schema.
    current_password: str | None = None
    new_password: str = Field(min_length=8, max_length=72)


class LoginActivityResponse(BaseModel):
    id: str
    method: str
    ip: str | None
    user_agent: str | None
    created_at: datetime


class LoginActivityListResponse(BaseModel):
    logins: list[LoginActivityResponse]
