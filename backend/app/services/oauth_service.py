"""OAuth code-exchange for Google and GitHub.

The browser never sees the client secret. It sends only the short-lived
authorization `code`; this module exchanges it server-side for an access
token, then fetches the user's profile and returns a normalised
identity. The access token from the provider is used once, here, and
never stored — Nimbus issues its own session afterwards.

A provider is only usable if its client id AND secret are configured;
otherwise start_login/exchange raise 404 so an unconfigured provider is
indistinguishable from one that does not exist.
"""

from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

# Providers reachable over the network; timeouts keep a slow provider from
# holding a Lambda invocation open to its full 30s limit.
_HTTP_TIMEOUT = httpx.Timeout(10.0)


@dataclass(frozen=True)
class OAuthIdentity:
    email: str
    full_name: str
    provider: str


@dataclass(frozen=True)
class _ProviderConfig:
    name: str
    client_id: str
    client_secret: str
    authorize_url: str
    token_url: str
    scope: str


def _provider(name: str) -> _ProviderConfig:
    if name == "google":
        cfg = _ProviderConfig(
            name="google",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            scope="openid email profile",
        )
    elif name == "github":
        cfg = _ProviderConfig(
            name="github",
            client_id=settings.GITHUB_CLIENT_ID,
            client_secret=settings.GITHUB_CLIENT_SECRET,
            authorize_url="https://github.com/login/oauth/authorize",
            token_url="https://github.com/login/oauth/access_token",
            # user:email is required to read a verified email when the
            # GitHub profile hides it.
            scope="read:user user:email",
        )
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider.")

    if not cfg.client_id or not cfg.client_secret:
        # Configured-off looks the same as non-existent, on purpose.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This sign-in method is not enabled."
        )
    return cfg


def enabled_providers() -> list[str]:
    """Which providers are fully configured — drives the public config."""
    out = []
    if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
        out.append("google")
    if settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
        out.append("github")
    return out


def _bad_gateway(detail: str) -> HTTPException:
    # The provider failed us, not the client — 502, not 400.
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


async def exchange_code(provider_name: str, code: str, redirect_uri: str) -> OAuthIdentity:
    """Turn an authorization code into a verified identity.

    redirect_uri must exactly match the one the browser used and one that
    is registered with the provider; it is validated against the allowed
    origins by the caller before we get here.
    """
    cfg = _provider(provider_name)

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        token = await _fetch_token(client, cfg, code, redirect_uri)
        if provider_name == "google":
            return await _google_identity(client, token)
        return await _github_identity(client, token)


async def _fetch_token(
    client: httpx.AsyncClient, cfg: _ProviderConfig, code: str, redirect_uri: str
) -> str:
    try:
        resp = await client.post(
            cfg.token_url,
            data={
                "code": code,
                "client_id": cfg.client_id,
                "client_secret": cfg.client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
    except httpx.HTTPError:
        raise _bad_gateway("Could not reach the identity provider.")

    if resp.status_code != 200:
        # A bad/expired/reused code lands here; surface it as a client
        # error rather than a 502, since retrying will not help.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign-in failed. Please try again.",
        )

    payload = resp.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign-in failed. Please try again.",
        )
    return access_token


async def _google_identity(client: httpx.AsyncClient, access_token: str) -> OAuthIdentity:
    try:
        resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
    except httpx.HTTPError:
        raise _bad_gateway("Could not read your Google profile.")
    if resp.status_code != 200:
        raise _bad_gateway("Could not read your Google profile.")

    data = resp.json()
    email = data.get("email")
    # Only a provider-verified email may be trusted for account linking:
    # an unverified one could otherwise take over someone else's account.
    if not email or not data.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Google account has no verified email address.",
        )
    name = data.get("name") or email.split("@")[0]
    return OAuthIdentity(email=email.lower(), full_name=name, provider="google")


async def _github_identity(client: httpx.AsyncClient, access_token: str) -> OAuthIdentity:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
    }
    try:
        profile_resp = await client.get("https://api.github.com/user", headers=headers)
        emails_resp = await client.get("https://api.github.com/user/emails", headers=headers)
    except httpx.HTTPError:
        raise _bad_gateway("Could not read your GitHub profile.")
    if profile_resp.status_code != 200 or emails_resp.status_code != 200:
        raise _bad_gateway("Could not read your GitHub profile.")

    profile = profile_resp.json()
    # GitHub hides the profile email when set private, so the verified
    # primary must come from the emails endpoint, not profile["email"].
    primary = next(
        (
            e["email"]
            for e in emails_resp.json()
            if e.get("primary") and e.get("verified")
        ),
        None,
    )
    if not primary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your GitHub account has no verified primary email.",
        )
    name = profile.get("name") or profile.get("login") or primary.split("@")[0]
    return OAuthIdentity(email=primary.lower(), full_name=name, provider="github")
