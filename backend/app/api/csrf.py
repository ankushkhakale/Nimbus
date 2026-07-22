"""Origin checking for the cookie-authenticated endpoints.

Only /auth/refresh and /auth/logout read the refresh cookie. Everything
else authenticates with `Authorization: Bearer`, which a cross-origin
page cannot set, so those are already immune to CSRF.

Because the frontend and API are on different sites the cookie must be
SameSite=None, which is precisely the setting that lets a hostile page
trigger these two endpoints. What that would achieve is limited — CORS
still stops the attacker reading the response, so no token can be stolen
— but a forced rotation or logout is a real nuisance, and checking the
Origin closes it.

A double-submit CSRF token would be the heavier alternative. It is not
worth it here: it would protect the same two endpoints against the same
narrow nuisance, at the cost of state the client has to carry.
"""

import logging

from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger(__name__)


def _allowed() -> list[str]:
    return settings.cors_origins_list


async def require_trusted_origin(request: Request) -> None:
    """Reject cookie-bearing requests from origins we do not serve.

    Requests with no Origin at all are allowed: curl, mobile clients and
    server-to-server callers omit it, and none of them are the CSRF
    threat — that threat is specifically a browser page acting under a
    user's ambient cookie, and browsers always send Origin on POST.
    """
    origin = request.headers.get("origin")
    if origin is None:
        return

    if origin not in _allowed():
        logger.warning("Rejected cookie request from untrusted origin: %s", origin)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Origin not allowed.",
        )
