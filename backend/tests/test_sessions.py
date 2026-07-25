"""Session management: list active sessions, flag the current one, and
revoke another device."""

AUTH = "/api/v1/auth"


def _register_and_login(client, email, password="Passw0rd!", ua="TestBrowser/1.0"):
    client.post(
        f"{AUTH}/register",
        json={"email": email, "full_name": "Session Test", "password": password},
    )
    resp = client.post(
        f"{AUTH}/login",
        json={"email": email, "password": password},
        headers={"User-Agent": ua},
    )
    return resp


def test_login_creates_a_listable_session(client):
    login = _register_and_login(client, "s1@example.com", ua="Firefox/123")
    token = login.json()["access_token"]

    resp = client.get(f"{AUTH}/sessions", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    sessions = resp.json()["sessions"]
    assert len(sessions) == 1
    assert sessions[0]["user_agent"] == "Firefox/123"
    # The session the request came through is flagged as current.
    assert sessions[0]["current"] is True


def test_two_logins_are_two_sessions(client):
    email = "s2@example.com"
    _register_and_login(client, email, ua="DeviceA")
    # A second login (different device) issues a second session.
    login2 = client.post(
        f"{AUTH}/login",
        json={"email": email, "password": "Passw0rd!"},
        headers={"User-Agent": "DeviceB"},
    )
    token2 = login2.json()["access_token"]

    sessions = client.get(
        f"{AUTH}/sessions", headers={"Authorization": f"Bearer {token2}"}
    ).json()["sessions"]
    assert len(sessions) == 2
    agents = {s["user_agent"] for s in sessions}
    assert agents == {"DeviceA", "DeviceB"}
    # Exactly one is the current (DeviceB, which made this request).
    current = [s for s in sessions if s["current"]]
    assert len(current) == 1
    assert current[0]["user_agent"] == "DeviceB"


def test_revoke_other_session(client):
    email = "s3@example.com"
    _register_and_login(client, email, ua="DeviceA")
    login2 = client.post(
        f"{AUTH}/login",
        json={"email": email, "password": "Passw0rd!"},
        headers={"User-Agent": "DeviceB"},
    )
    token2 = login2.json()["access_token"]
    auth = {"Authorization": f"Bearer {token2}"}

    sessions = client.get(f"{AUTH}/sessions", headers=auth).json()["sessions"]
    other = next(s for s in sessions if not s["current"])

    resp = client.delete(f"{AUTH}/sessions/{other['id']}", headers=auth)
    assert resp.status_code == 204

    remaining = client.get(f"{AUTH}/sessions", headers=auth).json()["sessions"]
    assert len(remaining) == 1
    assert remaining[0]["current"] is True


def test_sessions_require_auth(client):
    assert client.get(f"{AUTH}/sessions").status_code == 401


def test_rotation_keeps_one_session(client):
    """Refreshing (rotating the token) must not spawn a second session —
    the rotated token joins the original session."""
    login = _register_and_login(client, "s4@example.com", ua="RotatingDevice")
    token = login.json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    # The login set the refresh cookie on the test client; refresh rotates it.
    refreshed = client.post(f"{AUTH}/refresh")
    assert refreshed.status_code == 200

    sessions = client.get(f"{AUTH}/sessions", headers=auth).json()["sessions"]
    assert len(sessions) == 1
    assert sessions[0]["user_agent"] == "RotatingDevice"
