from datetime import datetime, timedelta, timezone

from jose import jwt

from app.core.config import settings
from app.utils.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_password_is_salted_and_not_plaintext():
    hashed = hash_password("password123")
    assert hashed != "password123"
    assert hash_password("password123") != hashed


def test_verify_password_roundtrip():
    hashed = hash_password("password123")
    assert verify_password("password123", hashed)
    assert not verify_password("wrongpassword", hashed)


def test_create_and_decode_access_token_roundtrip():
    token = create_access_token(subject="user-123")
    assert decode_access_token(token) == "user-123"


def test_decode_access_token_returns_none_for_garbage_token():
    assert decode_access_token("not-a-real-token") is None


def test_decode_access_token_returns_none_for_expired_token():
    expired_payload = {
        "sub": "user-123",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
    }
    expired_token = jwt.encode(
        expired_payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    assert decode_access_token(expired_token) is None


def test_decode_access_token_returns_none_for_wrong_signing_key():
    token = jwt.encode(
        {"sub": "user-123", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
        "a-completely-different-secret",
        algorithm=settings.JWT_ALGORITHM,
    )
    assert decode_access_token(token) is None
