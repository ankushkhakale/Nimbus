from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

# Anchored to this file, not the working directory, so `uvicorn` started
# from backend/ and from the repo root both load the same .env. On Lambda
# there is no .env at all — config comes from environment variables.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_ENV_FILES = (_BACKEND_DIR.parent / ".env", _BACKEND_DIR / ".env")


class Settings(BaseSettings):
    PROJECT_NAME: str = "Nimbus"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # MongoDB Settings
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "nimbus"

    # Comma-separated allowed browser origins. Never "*" in production:
    # the frontend sends an Authorization header, and the CORS spec makes
    # browsers reject a wildcard origin on credentialed requests.
    CORS_ORIGINS: str = "http://localhost:3000"

    # Auth / JWT Settings
    JWT_SECRET_KEY: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # Refresh tokens. Opaque random strings stored hashed, not JWTs — a
    # stateless refresh token cannot be revoked, and revocation is the
    # entire point of having one.
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REFRESH_COOKIE_NAME: str = "nimbus_refresh"
    # The frontend and API are on different sites (vercel.app vs
    # execute-api), so the cookie must be SameSite=None to be sent at
    # all — which mandates Secure. Overridable for same-origin setups,
    # where "lax" is strictly better.
    REFRESH_COOKIE_SAMESITE: str = "none"
    REFRESH_COOKIE_SECURE: bool = True

    # OAuth (Google, GitHub). Empty client ids leave the provider
    # disabled — the endpoints 404 and the frontend hides the buttons —
    # so the app runs fine with password auth alone until these are set.
    # Secrets live only here (Lambda env vars), never in the frontend.
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    # S3 / Object Storage Settings
    # Credentials come from boto3's default chain (env vars locally, the
    # execution role on Lambda) — deliberately not settings, so keys never
    # need to live in config or .env in production.
    S3_BUCKET_NAME: str = "nimbus-storage"
    S3_REGION: str = "ap-south-1"
    # Override for MinIO/localstack; empty means the regional AWS endpoint.
    S3_ENDPOINT_URL: str = ""
    PRESIGNED_URL_EXPIRE_SECONDS: int = 3600

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES, env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
