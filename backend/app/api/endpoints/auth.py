import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse

from app.api.csrf import require_trusted_origin
from app.api.deps import get_auth_service, get_current_user
from app.core.config import settings
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


def _set_refresh_cookie(response: Response, token: str) -> None:
    """Attach the refresh token as an httpOnly cookie.

    httpOnly is the entire point: the access token lives in JavaScript
    memory and dies with the tab, while this survives a reload and is
    unreadable to any script, including an XSS payload.

    Path is scoped to /api/v1/auth so the cookie is never attached to
    file or folder requests, which have no use for it.
    """
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/api/v1/auth",
    )


def _session_expired() -> JSONResponse:
    """401 that also clears the dead cookie."""
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": "Session expired. Please sign in again."},
    )
    _clear_refresh_cookie(response)
    return response


def _clear_refresh_cookie(response: Response) -> None:
    # Attributes must match those used to set it, or the browser keeps
    # the original cookie and "logout" silently does nothing.
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/api/v1/auth",
    )


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
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    user = await auth_service.authenticate(payload.email, payload.password)
    _set_refresh_cookie(response, await auth_service.issue_refresh_token(user))
    return TokenResponse(access_token=AuthService.issue_token(user))


@router.post(
    "/refresh",
    response_model=TokenResponse,
    dependencies=[Depends(require_trusted_origin)],
)
async def refresh(
    response: Response,
    nimbus_refresh: str | None = Cookie(default=None),
    auth_service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Exchange the refresh cookie for a new access token.

    This is what makes a page reload survivable: the access token is held
    only in memory, so on load the app has nothing until it calls here.
    """
    if not nimbus_refresh:
        return _session_expired()

    try:
        user, rotated = await auth_service.rotate_refresh_token(nimbus_refresh)
    except HTTPException:
        # Returned rather than raised: FastAPI builds a fresh response
        # when handling a raised HTTPException, which discards any cookie
        # set on the injected one — so raising here would leave the dead
        # cookie in place and the browser retrying it forever.
        return _session_expired()

    _set_refresh_cookie(response, rotated)
    return TokenResponse(access_token=AuthService.issue_token(user))


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_trusted_origin)],
)
async def logout(
    response: Response,
    nimbus_refresh: str | None = Cookie(default=None),
    auth_service: AuthService = Depends(get_auth_service),
) -> Response:
    """Revoke the session server-side and clear the cookie.

    Deliberately succeeds even with no cookie or an unknown one — a
    logout that can fail leaves people stuck signed in.
    """
    await auth_service.revoke_refresh_token(nimbus_refresh)
    _clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


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
