REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
ME_URL = "/api/v1/auth/me"
FORGOT_PASSWORD_URL = "/api/v1/auth/forgot-password"


def _register(client, email="alice@example.com", full_name="Alice", password="password123"):
    return client.post(
        REGISTER_URL,
        json={"email": email, "full_name": full_name, "password": password},
    )


def test_register_returns_public_user_without_password(client):
    resp = _register(client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "alice@example.com"
    assert body["full_name"] == "Alice"
    assert "id" in body
    assert "password" not in body
    assert "hashed_password" not in body


def test_register_duplicate_email_is_rejected(client):
    _register(client)
    resp = _register(client, full_name="Alice Again", password="anotherpassword")
    assert resp.status_code == 409


def test_register_reports_409_when_unique_index_rejects_a_race(client, fake_user_repo):
    """Concurrent registration: the pre-check passes but the unique index
    fires. Must surface as 409, not a 500."""
    from pymongo.errors import DuplicateKeyError

    async def racing_create(*args, **kwargs):
        raise DuplicateKeyError("E11000 duplicate key error: email")

    fake_user_repo.create = racing_create
    resp = _register(client)
    assert resp.status_code == 409


def test_register_rejects_short_password(client):
    resp = _register(client, password="short")
    assert resp.status_code == 422


def test_register_rejects_invalid_email(client):
    resp = _register(client, email="not-an-email")
    assert resp.status_code == 422


def test_register_rejects_password_over_bcrypt_byte_limit(client):
    resp = _register(client, password="a" * 73)
    assert resp.status_code == 422


def test_register_accepts_password_at_bcrypt_byte_limit(client):
    resp = _register(client, password="a" * 72)
    assert resp.status_code == 201


def test_login_succeeds_with_correct_credentials(client):
    _register(client)
    resp = client.post(LOGIN_URL, json={"email": "alice@example.com", "password": "password123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and body["access_token"]


def test_login_fails_with_wrong_password(client):
    _register(client)
    resp = client.post(LOGIN_URL, json={"email": "alice@example.com", "password": "wrongpassword"})
    assert resp.status_code == 401


def test_login_fails_for_unknown_email(client):
    resp = client.post(LOGIN_URL, json={"email": "nobody@example.com", "password": "password123"})
    assert resp.status_code == 401


def test_me_requires_authorization_header(client):
    resp = client.get(ME_URL)
    assert resp.status_code == 401


def test_me_rejects_garbage_token(client):
    resp = client.get(ME_URL, headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_me_returns_current_user_for_valid_token(client):
    _register(client)
    login_resp = client.post(LOGIN_URL, json={"email": "alice@example.com", "password": "password123"})
    token = login_resp.json()["access_token"]

    resp = client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "alice@example.com"
    assert body["full_name"] == "Alice"


def test_forgot_password_accepts_known_email(client):
    _register(client)
    resp = client.post(FORGOT_PASSWORD_URL, json={"email": "alice@example.com"})
    assert resp.status_code == 202
    assert "message" in resp.json()


def test_forgot_password_gives_identical_response_for_unknown_email(client):
    """Anti-enumeration: known and unknown emails must be indistinguishable."""
    _register(client)
    known = client.post(FORGOT_PASSWORD_URL, json={"email": "alice@example.com"})
    unknown = client.post(FORGOT_PASSWORD_URL, json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
