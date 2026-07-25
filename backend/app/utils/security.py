import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> str | None:
    """Returns the subject (user id) from a valid token, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# --- refresh tokens ------------------------------------------------------


def new_refresh_token() -> str:
    """A high-entropy opaque token.

    Deliberately not a JWT: a self-describing token is valid until it
    expires no matter what the server thinks, so it cannot be revoked.
    Revocation — on logout, and on detecting a stolen token — is the
    whole reason this exists.
    """
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    """Hash for storage.

    Stored hashed for the same reason passwords are: a leaked database
    dump should not hand over live sessions. Plain SHA-256 rather than
    bcrypt is correct here — the input is 48 bytes of CSPRNG output, so
    there is no dictionary to attack and no need to be slow.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)


# --- share links -----------------------------------------------------------


def new_share_token() -> str:
    """A high-entropy opaque token for a share link's URL.

    Unlike a refresh token this is stored in plaintext (see Share's
    docstring) — the entropy is what matters here, not hiding it once
    issued.
    """
    return secrets.token_urlsafe(24)
