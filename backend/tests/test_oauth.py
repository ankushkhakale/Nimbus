"""OAuth sign-in: link-by-email, redirect validation, and — most
importantly — that only provider-verified emails are ever trusted."""

import asyncio

import httpx
import pytest

from app.services import oauth_service
from app.services.oauth_service import OAuthIdentity

AUTH = "/api/v1/auth"
COOKIE = "nimbus_refresh"
ORIGIN = "http://localhost:3000"
REDIRECT = f"{ORIGIN}/auth/callback"


@pytest.fixture
def fake_exchange(monkeypatch):
    """Replace the network exchange with a canned identity so endpoint
    tests exercise wiring, not Google/GitHub."""

    identity = {"value": OAuthIdentity(email="new@example.com", full_name="New", provider="google")}

    async def _exchange(provider, code, redirect_uri):
        return identity["value"]

    monkeypatch.setattr(oauth_service, "exchange_code", _exchange)
    return identity


# --- callback wiring ----------------------------------------------------

def test_oauth_callback_creates_a_session(client, fake_exchange):
    r = client.post(
        f"{AUTH}/oauth/google/callback",
        json={"code": "abc", "redirect_uri": REDIRECT},
        headers={"Origin": ORIGIN},
    )
    assert r.status_code == 200
    assert r.json()["access_token"]
    # Same session machinery as password login: refresh cookie is set.
    raw = r.headers.get("set-cookie", "")
    assert COOKIE in raw and "HttpOnly" in raw

    token = r.json()["access_token"]
    me = client.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "new@example.com"


def test_oauth_creates_a_user_with_no_password(client, fake_exchange, fake_user_repo):
    client.post(f"{AUTH}/oauth/google/callback",
                json={"code": "abc", "redirect_uri": REDIRECT}, headers={"Origin": ORIGIN})
    user = next(iter(fake_user_repo._by_id.values()))
    assert user.hashed_password is None
    assert user.providers == ["google"]


# --- link by email ------------------------------------------------------

def test_oauth_links_to_an_existing_password_account(client, fake_exchange, fake_user_repo):
    """Same email = same account. Signing in with Google for an address
    that already has a password account must not make a second one."""
    client.post(f"{AUTH}/register",
                json={"email": "shared@example.com", "full_name": "Shared", "password": "password123"})
    fake_exchange["value"] = OAuthIdentity(
        email="shared@example.com", full_name="Shared", provider="google"
    )

    r = client.post(f"{AUTH}/oauth/google/callback",
                    json={"code": "abc", "redirect_uri": REDIRECT}, headers={"Origin": ORIGIN})
    assert r.status_code == 200
    assert len(fake_user_repo._by_id) == 1  # linked, not duplicated
    user = next(iter(fake_user_repo._by_id.values()))
    assert set(user.providers) == {"password", "google"}


def test_linked_account_keeps_its_password(client, fake_exchange, fake_user_repo):
    """Adding Google to a password account must not remove the password."""
    client.post(f"{AUTH}/register",
                json={"email": "shared@example.com", "full_name": "S", "password": "password123"})
    fake_exchange["value"] = OAuthIdentity(
        email="shared@example.com", full_name="S", provider="google"
    )
    client.post(f"{AUTH}/oauth/google/callback",
                json={"code": "abc", "redirect_uri": REDIRECT}, headers={"Origin": ORIGIN})

    r = client.post(f"{AUTH}/login",
                    json={"email": "shared@example.com", "password": "password123"})
    assert r.status_code == 200


def test_second_oauth_login_does_not_duplicate_the_provider(client, fake_exchange, fake_user_repo):
    for _ in range(2):
        client.post(f"{AUTH}/oauth/google/callback",
                    json={"code": "abc", "redirect_uri": REDIRECT}, headers={"Origin": ORIGIN})
    user = next(iter(fake_user_repo._by_id.values()))
    assert user.providers == ["google"]  # not ["google", "google"]


# --- an OAuth-only account cannot be password-guessed -------------------

def test_password_login_on_an_oauth_only_account_is_generic_401(client, fake_exchange):
    """Must fail like any wrong password — never reveal the address is
    OAuth-only, and never crash on the None hash."""
    client.post(f"{AUTH}/oauth/google/callback",
                json={"code": "abc", "redirect_uri": REDIRECT}, headers={"Origin": ORIGIN})
    r = client.post(f"{AUTH}/login",
                    json={"email": "new@example.com", "password": "anything"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Incorrect email or password."


# --- redirect_uri validation -------------------------------------------

def test_callback_rejects_an_unregistered_redirect_uri(client, fake_exchange):
    """Our client credentials must not be driven against a foreign
    redirect, even with a valid-looking code."""
    r = client.post(f"{AUTH}/oauth/google/callback",
                    json={"code": "abc", "redirect_uri": "https://evil.example.com/auth/callback"},
                    headers={"Origin": ORIGIN})
    assert r.status_code == 400


# --- provider availability ---------------------------------------------

def test_config_lists_only_enabled_providers(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "x")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "y")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "")
    r = client.get(f"{AUTH}/config")
    assert r.json()["providers"] == ["google"]


def test_config_is_empty_when_nothing_configured(client, monkeypatch):
    from app.core.config import settings
    for attr in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
                 "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"):
        monkeypatch.setattr(settings, attr, "")
    assert client.get(f"{AUTH}/config").json()["providers"] == []


def test_unconfigured_provider_callback_is_404(client, monkeypatch):
    """A disabled provider must be indistinguishable from a nonexistent
    one — the real exchange is used here (not the fake), so config gates."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_SECRET", "")
    r = client.post(f"{AUTH}/oauth/google/callback",
                    json={"code": "abc", "redirect_uri": REDIRECT}, headers={"Origin": ORIGIN})
    assert r.status_code == 404


# --- identity parsing: the email-verification gate ---------------------
#
# Written as sync tests running the coroutine via asyncio.run, so they
# need no pytest-asyncio/anyio plugin configuration.

from fastapi import HTTPException  # noqa: E402


def _client_returning(handler):
    """An httpx.AsyncClient whose requests are served by `handler`."""
    return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=httpx.Timeout(5))


def test_google_rejects_an_unverified_email():
    """The core safety property: an unverified provider email must never
    become a login, or it could take over an account by that address."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"email": "victim@example.com", "email_verified": False,
                                         "name": "Victim"})

    with pytest.raises(HTTPException) as exc:
        asyncio.run(oauth_service._google_identity(_client_returning(handler), "tok"))
    assert exc.value.status_code == 400


def test_google_accepts_a_verified_email():
    def handler(request):
        return httpx.Response(200, json={"email": "OK@Example.com", "email_verified": True,
                                         "name": "Real Name"})

    identity = asyncio.run(oauth_service._google_identity(_client_returning(handler), "tok"))
    assert identity.email == "ok@example.com"  # normalised to lowercase
    assert identity.full_name == "Real Name"
    assert identity.provider == "google"


def test_github_uses_the_verified_primary_email_not_the_profile():
    """GitHub hides the profile email when private; the verified primary
    from /user/emails is the only trustworthy source."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/user":
            return httpx.Response(200, json={"email": None, "name": "GH User", "login": "ghuser"})
        return httpx.Response(200, json=[
            {"email": "secondary@example.com", "primary": False, "verified": True},
            {"email": "primary@example.com", "primary": True, "verified": True},
            {"email": "unverified@example.com", "primary": False, "verified": False},
        ])

    identity = asyncio.run(oauth_service._github_identity(_client_returning(handler), "tok"))
    assert identity.email == "primary@example.com"
    assert identity.provider == "github"


def test_github_rejects_when_no_verified_primary_email():
    def handler(request):
        if request.url.path == "/user":
            return httpx.Response(200, json={"email": None, "login": "ghuser"})
        return httpx.Response(200, json=[
            {"email": "unverified@example.com", "primary": True, "verified": False},
        ])

    with pytest.raises(HTTPException) as exc:
        asyncio.run(oauth_service._github_identity(_client_returning(handler), "tok"))
    assert exc.value.status_code == 400
