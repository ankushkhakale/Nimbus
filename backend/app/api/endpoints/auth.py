import logging

from fastapi import APIRouter, Depends, status

from app.api.deps import get_auth_service, get_current_user
from app.models.user import UserInDB
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.services.auth_service import AuthService

router = APIRouter()
logger = logging.getLogger(__name__)


def _to_public(user: UserInDB) -> UserPublic:
    return UserPublic(id=user.id, email=user.email, full_name=user.full_name)


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> UserPublic:
    user = await auth_service.register(payload.email, payload.full_name, payload.password)
    return _to_public(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    auth_service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    user = await auth_service.authenticate(payload.email, payload.password)
    token = AuthService.issue_token(user)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserPublic)
async def read_current_user(current_user: UserInDB = Depends(get_current_user)) -> UserPublic:
    return _to_public(current_user)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(payload: ForgotPasswordRequest) -> dict:
    # Always return the same generic response regardless of whether the email
    # is registered, to avoid leaking which addresses have accounts. No email
    # delivery is wired up yet (no mail provider in the stack) — this is
    # deliberately a no-op stub until that's built.
    logger.info("Password reset requested for %s (no-op: no mail provider configured)", payload.email)
    return {"message": "If an account with that email exists, a password reset link has been sent."}
