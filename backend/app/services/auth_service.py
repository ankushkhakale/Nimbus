import logging

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from app.models.user import UserInDB
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.utils.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    refresh_token_expiry,
    verify_password,
)

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository,
        refresh_tokens: RefreshTokenRepository | None = None,
    ):
        self._users = user_repository
        self._refresh = refresh_tokens

    _EMAIL_TAKEN = HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="An account with this email already exists.",
    )

    @staticmethod
    def invalid_session() -> HTTPException:
        # One message for every failure mode — expired, unknown, replayed
        # — so a caller cannot distinguish "never existed" from "revoked".
        return HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please sign in again.",
        )

    # --- accounts ------------------------------------------------------

    async def register(self, email: str, full_name: str, password: str) -> UserInDB:
        if await self._users.get_by_email(email):
            raise self._EMAIL_TAKEN
        try:
            return await self._users.create(email, full_name, hash_password(password))
        except DuplicateKeyError:
            # Lost a race against a concurrent registration for the same
            # email; the unique index is the real guard, so report the
            # same 409 rather than a 500.
            raise self._EMAIL_TAKEN

    async def authenticate(self, email: str, password: str) -> UserInDB:
        user = await self._users.get_by_email(email)
        # `user.hashed_password` is None for OAuth-only accounts;
        # verify_password against None must fail rather than raise, and
        # the message stays generic so it never reveals that an address
        # exists but has no password.
        if not user or not user.hashed_password or not verify_password(
            password, user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password.",
            )
        return user

    async def sign_in_with_oauth(self, email: str, full_name: str, provider: str) -> UserInDB:
        """Find or create an account for a provider-verified email.

        Link-by-email: the same address is the same account however the
        person signs in. A new provider on an existing account is
        recorded so the UI can show it. The email is already verified by
        the provider before this is called.
        """
        existing = await self._users.get_by_email(email)
        if existing is None:
            return await self._users.create_oauth_user(email, full_name, provider)
        if provider not in existing.providers:
            await self._users.add_provider(existing.id, provider)
        return existing

    # --- profile ---------------------------------------------------------

    async def update_profile(
        self, user_id: str, *, full_name: str | None, storage_quota_bytes: int | None
    ) -> UserInDB:
        updated = await self._users.update_profile(
            user_id, full_name=full_name, storage_quota_bytes=storage_quota_bytes
        )
        if updated is None:  # pragma: no cover - account deleted mid-request
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
        return updated

    async def change_password(
        self, user: UserInDB, current_password: str | None, new_password: str
    ) -> None:
        """Set or change a password.

        An account that already has one must prove it first — otherwise
        a hijacked access token (e.g. a still-live session on a stolen
        device) could silently take over the account by setting a new
        password. An OAuth-only account has nothing to prove yet, so
        `current_password` is simply not required the first time.
        """
        if user.has_password:
            if not current_password or not verify_password(
                current_password, user.hashed_password  # type: ignore[arg-type]
            ):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Current password is incorrect.",
                )
        await self._users.update_password(user.id, hash_password(new_password))

    # --- tokens --------------------------------------------------------

    @staticmethod
    def issue_token(user: UserInDB) -> str:
        return create_access_token(subject=user.id)

    async def issue_refresh_token(self, user: UserInDB) -> str:
        """Mint a refresh token and record its hash."""
        if self._refresh is None:  # pragma: no cover - wiring guard
            raise RuntimeError("Refresh token repository is not configured.")
        token = new_refresh_token()
        await self._refresh.create(user.id, hash_refresh_token(token), refresh_token_expiry())
        return token

    async def rotate_refresh_token(self, token: str) -> tuple[UserInDB, str]:
        """Exchange a refresh token for a fresh access token and a new
        refresh token.

        Rotation is single-use. Presenting an already-used token means it
        exists in two places, so every session for that account is
        revoked rather than trying to guess which holder is genuine.
        """
        if self._refresh is None:  # pragma: no cover - wiring guard
            raise RuntimeError("Refresh token repository is not configured.")

        token_hash = hash_refresh_token(token)
        record = await self._refresh.find(token_hash)
        if record is None:
            raise self.invalid_session()

        if record.get("used_at") is not None:
            logger.warning(
                "Refresh token replayed for user %s; revoking all sessions",
                record["user_id"],
            )
            await self._refresh.revoke_all_for_user(record["user_id"])
            raise self.invalid_session()

        # Atomic: two concurrent refreshes cannot both win, so a genuine
        # double-submit does not look like theft.
        if not await self._refresh.mark_used(token_hash):
            raise self.invalid_session()

        user = await self._users.get_by_id(record["user_id"])
        if user is None:
            # Account deleted while a session was still live.
            await self._refresh.revoke_all_for_user(record["user_id"])
            raise self.invalid_session()

        # The spent token is deliberately kept, marked used, rather than
        # deleted. Deleting it would make a replay indistinguishable from
        # an unknown token, and reuse detection depends on telling those
        # apart. The TTL index removes it once it expires anyway.
        return user, await self.issue_refresh_token(user)

    async def sign_out_everywhere(self, user_id: str) -> None:
        """Revoke every refresh token for this account, on every device.

        The caller's own current access token still has up to 24h left to
        live — it's a stateless JWT with no revocation list — but this
        stops it (and every other device's session) from ever refreshing
        again, so the practical effect is a sign-out everywhere within one
        token lifetime at most.
        """
        if self._refresh is None:  # pragma: no cover - wiring guard
            raise RuntimeError("Refresh token repository is not configured.")
        await self._refresh.revoke_all_for_user(user_id)

    async def revoke_refresh_token(self, token: str | None) -> None:
        """Sign out. Absent or unknown tokens are ignored — logout should
        never fail."""
        if self._refresh is None or not token:
            return
        await self._refresh.revoke(hash_refresh_token(token))
