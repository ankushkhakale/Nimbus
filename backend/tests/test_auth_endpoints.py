REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
ME_URL = "/api/v1/auth/me"
CHANGE_PASSWORD_URL = "/api/v1/auth/me/change-password"
SIGN_OUT_EVERYWHERE_URL = "/api/v1/auth/me/sign-out-everywhere"
REFRESH_URL = "/api/v1/auth/refresh"
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


def test_me_returns_storage_quota_and_providers(client, auth_headers):
    resp = client.get(ME_URL, headers=auth_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["providers"] == ["password"]
    assert body["has_password"] is True
    assert body["storage_quota_bytes"] == 100 * 1024**3


def test_update_profile_changes_full_name(client, auth_headers):
    headers = auth_headers()
    resp = client.patch(ME_URL, json={"full_name": "Alice Renamed"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["full_name"] == "Alice Renamed"

    # Persisted, not just echoed back.
    resp = client.get(ME_URL, headers=headers)
    assert resp.json()["full_name"] == "Alice Renamed"


def test_update_profile_changes_storage_quota(client, auth_headers):
    headers = auth_headers()
    new_quota = 5 * 1024**4  # 5 TB
    resp = client.patch(ME_URL, json={"storage_quota_bytes": new_quota}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["storage_quota_bytes"] == new_quota


def test_update_profile_rejects_quota_outside_bounds(client, auth_headers):
    headers = auth_headers()
    too_small = client.patch(ME_URL, json={"storage_quota_bytes": 1024}, headers=headers)
    assert too_small.status_code == 422

    too_large = client.patch(ME_URL, json={"storage_quota_bytes": 1024**6}, headers=headers)
    assert too_large.status_code == 422


def test_update_profile_requires_authorization(client):
    resp = client.patch(ME_URL, json={"full_name": "Nobody"})
    assert resp.status_code == 401


def test_change_password_requires_current_password_when_one_exists(client, auth_headers):
    headers = auth_headers()
    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": None, "new_password": "newpassword123"},
        headers=headers,
    )
    assert resp.status_code == 401


def test_change_password_rejects_wrong_current_password(client, auth_headers):
    headers = auth_headers()
    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": "wrongpassword", "new_password": "newpassword123"},
        headers=headers,
    )
    assert resp.status_code == 401


def test_change_password_succeeds_and_new_password_logs_in(client, auth_headers):
    headers = auth_headers()
    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": "password123", "new_password": "newpassword123"},
        headers=headers,
    )
    assert resp.status_code == 204

    old_login = client.post(LOGIN_URL, json={"email": "owner@example.com", "password": "password123"})
    assert old_login.status_code == 401

    new_login = client.post(
        LOGIN_URL, json={"email": "owner@example.com", "password": "newpassword123"}
    )
    assert new_login.status_code == 200


def test_change_password_rejects_short_new_password(client, auth_headers):
    headers = auth_headers()
    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": "password123", "new_password": "short"},
        headers=headers,
    )
    assert resp.status_code == 422


def test_change_password_on_oauth_only_account_needs_no_current_password(
    client, fake_user_repo
):
    from app.utils.security import create_access_token

    user = fake_user_repo._insert("oauth@example.com", "OAuth Only", None, ["google"])
    token = create_access_token(subject=user.id)

    resp = client.post(
        CHANGE_PASSWORD_URL,
        json={"current_password": None, "new_password": "brandnewpassword"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204

    login = client.post(
        LOGIN_URL, json={"email": "oauth@example.com", "password": "brandnewpassword"}
    )
    assert login.status_code == 200

    me = client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert "password" in me.json()["providers"]


def test_sign_out_everywhere_revokes_the_refresh_cookie(client, auth_headers):
    # auth_headers() already performed a login, so the refresh cookie for
    # this session is sitting in the client's cookie jar.
    headers = auth_headers()
    resp = client.post(SIGN_OUT_EVERYWHERE_URL, headers=headers)
    assert resp.status_code == 204

    refreshed = client.post(REFRESH_URL)
    assert refreshed.status_code == 401


def test_sign_out_everywhere_requires_authorization(client):
    resp = client.post(SIGN_OUT_EVERYWHERE_URL)
    assert resp.status_code == 401


def test_sign_out_everywhere_revokes_every_session_not_just_the_caller(client, auth_headers):
    """Two logins for the same account, one sign-out-everywhere call, and
    neither refresh token should survive."""
    email = "owner@example.com"
    first_headers = auth_headers(email)
    # A second login for the same account rotates the jar's cookie onto a
    # second, distinct refresh token — simulating a second device.
    second_login = client.post(LOGIN_URL, json={"email": email, "password": "password123"})
    assert second_login.cookies.get("nimbus_refresh")

    client.post(SIGN_OUT_EVERYWHERE_URL, headers=first_headers)

    # The jar still holds the second login's cookie; it must be dead too.
    resp = client.post(REFRESH_URL)
    assert resp.status_code == 401
