"""A record of one successful sign-in, for the "recent sign-ins" list in
Settings — the security-audit affordance that lets a user notice a
login they don't recognise.

Only successful logins are recorded, and only for a known user (a
failed login has no user to attribute it to). IP and user-agent are
best-effort: behind API Gateway the client IP comes from
X-Forwarded-For, which can be absent.
"""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class LoginActivity(BaseModel):
    id: str
    user_id: str
    # "password", "google", or "github".
    method: str
    ip: str | None = None
    user_agent: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
