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
