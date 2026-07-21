from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache

class Settings(BaseSettings):
    PROJECT_NAME: str = "Nimbus"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # MongoDB Settings
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "nimbus"

    # Auth / JWT Settings
    JWT_SECRET_KEY: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # S3 / Object Storage Settings
    # Credentials come from boto3's default chain (env vars locally, the
    # execution role on Lambda) — deliberately not settings, so keys never
    # need to live in config or .env in production.
    S3_BUCKET_NAME: str = "nimbus-storage"
    S3_REGION: str = "ap-south-1"
    # Override for MinIO/localstack; empty means the regional AWS endpoint.
    S3_ENDPOINT_URL: str = ""
    PRESIGNED_URL_EXPIRE_SECONDS: int = 3600

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
