"""Refresh-token flow: rotation, replay detection, logout, CSRF origin."""

import pytest

AUTH = "/api/v1/auth"
COOKIE = "nimbus_refresh"
ORIGIN = "http://localhost:3000"  # matches the default CORS allowlist


def _register(client, email="a@example.com", password="password123"):
    client.post(f"{AUTH}/register",
                json={"email": email, "full_name": "A", "password": password})


def _login(client, email="a@example.com", password="password123"):
    return client.post(f"{AUTH}/login", json={"email": email, "password": password})


# --- login issues the cookie -------------------------------------------

def test_login_sets_an_httponly_refresh_cookie(client):
    _register(client)
    r = _login(client)
    assert r.status_code == 200
    assert r.json()["access_token"]

    raw = r.headers.get("set-cookie", "")
    assert COOKIE in raw
    # httpOnly is the whole point: an XSS payload must not be able to
    # read this the way it could read localStorage.
    assert "HttpOnly" in raw
    # Cross-site (vercel.app -> execute-api) requires SameSite=None,
    # which browsers only honour alongside Secure.
    assert "samesite=none" in raw.lower()
    assert "Secure" in raw
    # Scoped so it is never attached to file/folder requests.
    assert "Path=/api/v1/auth" in raw


def test_refresh_token_is_not_the_access_token(client):
    """They have different lifetimes and revocability; conflating them
    would make the long-lived one readable by JavaScript."""
    _register(client)
    r = _login(client)
    assert client.cookies.get(COOKIE) != r.json()["access_token"]


# --- the actual point: surviving a reload ------------------------------

def test_refresh_returns_a_working_access_token(client):
    _register(client)
    _login(client)

    r = client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN})
    assert r.status_code == 200
    token = r.json()["access_token"]

    me = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"


def test_refresh_without_a_cookie_is_401(client):
    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 401


def test_refresh_with_an_unknown_token_is_401(client):
    _register(client)
    _login(client)
    client.cookies.set(COOKIE, "not-a-real-token", path="/api/v1/auth")
    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 401


# --- rotation and replay ------------------------------------------------

def test_refresh_rotates_the_cookie(client):
    _register(client)
    _login(client)
    first = client.cookies.get(COOKIE)

    client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN})
    assert client.cookies.get(COOKIE) != first


def test_a_replayed_token_is_rejected(client, fake_refresh_repo):
    """Single-use: the old token must die the moment it is exchanged."""
    _register(client)
    _login(client)
    stolen = client.cookies.get(COOKIE)

    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 200

    client.cookies.set(COOKIE, stolen, path="/api/v1/auth")
    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 401


def test_replay_revokes_every_session_for_that_user(client, fake_refresh_repo):
    """A token in two places means one holder is a thief, and there is no
    way to tell which — so all sessions end rather than guessing."""
    _register(client)
    _login(client)
    stolen = client.cookies.get(COOKIE)
    client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN})  # legitimate use
    live_after_rotation = client.cookies.get(COOKIE)

    # Thief replays the old one.
    client.cookies.set(COOKIE, stolen, path="/api/v1/auth")
    client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN})

    # The victim's still-valid token must now also be dead.
    client.cookies.set(COOKIE, live_after_rotation, path="/api/v1/auth")
    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 401
    assert fake_refresh_repo.rows == {}


def test_failed_refresh_clears_the_cookie(client):
    """Otherwise the browser keeps retrying a token that can never work."""
    _register(client)
    _login(client)
    client.cookies.set(COOKIE, "bogus", path="/api/v1/auth")
    r = client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN})
    assert r.status_code == 401
    assert 'nimbus_refresh=""' in r.headers.get("set-cookie", "") or \
           "Max-Age=0" in r.headers.get("set-cookie", "")


# --- storage ------------------------------------------------------------

def test_tokens_are_stored_hashed_never_in_the_clear(client, fake_refresh_repo):
    """A database dump must not hand over live sessions."""
    _register(client)
    _login(client)
    raw = client.cookies.get(COOKIE)

    assert raw not in fake_refresh_repo.rows
    stored = list(fake_refresh_repo.rows)
    assert len(stored) == 1
    assert len(stored[0]) == 64  # sha256 hex
    assert stored[0] != raw


def test_each_login_is_an_independent_session(client):
    """Signing in on a second device must not invalidate the first."""
    _register(client)
    first = _login(client).cookies.get(COOKIE) or client.cookies.get(COOKIE)
    client.cookies.clear()
    _login(client)
    second = client.cookies.get(COOKIE)

    client.cookies.set(COOKIE, first, path="/api/v1/auth")
    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 200
    assert first != second


# --- logout -------------------------------------------------------------

def test_logout_revokes_the_session_server_side(client):
    _register(client)
    _login(client)
    revoked = client.cookies.get(COOKIE)

    assert client.post(f"{AUTH}/logout", headers={"Origin": ORIGIN}).status_code == 204

    # Even replaying the cookie must not resurrect the session — the
    # server forgot it, so clearing the browser copy is not the only
    # thing standing in the way.
    client.cookies.set(COOKIE, revoked, path="/api/v1/auth")
    assert client.post(f"{AUTH}/refresh", headers={"Origin": ORIGIN}).status_code == 401


def test_logout_succeeds_without_a_cookie(client):
    """A logout that can fail leaves people stuck signed in."""
    assert client.post(f"{AUTH}/logout", headers={"Origin": ORIGIN}).status_code == 204


# --- CSRF ---------------------------------------------------------------

@pytest.mark.parametrize("path", ["/refresh", "/logout"])
def test_cookie_endpoints_reject_untrusted_origins(client, path):
    """SameSite=None is what lets a hostile page send the cookie at all;
    the Origin check is what stops it achieving anything."""
    _register(client)
    _login(client)
    r = client.post(f"{AUTH}{path}", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 403


def test_requests_without_an_origin_are_allowed(client):
    """curl and native clients omit Origin, and neither is the CSRF
    threat — that is specifically a browser page acting under ambient
    cookies, and browsers always send Origin on POST."""
    _register(client)
    _login(client)
    assert client.post(f"{AUTH}/refresh").status_code == 200


def test_login_is_unaffected_by_origin(client):
    """Login carries credentials in the body, not a cookie, so it is not
    part of the CSRF surface and must not be gated."""
    _register(client)
    r = client.post(f"{AUTH}/login",
                    json={"email": "a@example.com", "password": "password123"},
                    headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 200
