import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.api_router import api_router
from app.database.mongodb import connect_to_mongo, close_mongo_connection, get_database
from app.repositories.item_repository import ItemRepository
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.share_repository import ShareRepository
from app.repositories.user_repository import UserRepository

# Configure basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI app.
    Handles startup and shutdown events, such as DB connections.
    """
    logger.info(f"Starting up {settings.PROJECT_NAME} backend...")
    await connect_to_mongo()
    # The unique index on email is what actually prevents duplicate
    # accounts — the check in AuthService.register is not atomic, so two
    # concurrent registrations could otherwise both pass it.
    db = get_database()
    await UserRepository(db).ensure_indexes()
    await ItemRepository(db).ensure_indexes()
    # Includes a TTL index, so expired sessions delete themselves.
    await RefreshTokenRepository(db).ensure_indexes()
    await ShareRepository(db).ensure_indexes()
    yield
    logger.info(f"Shutting down {settings.PROJECT_NAME} backend...")
    await close_mongo_connection()

def create_app() -> FastAPI:
    """
    Application factory.
    """
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        lifespan=lifespan,
    )

    # Configure CORS middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include API router
    application.include_router(api_router, prefix=settings.API_V1_STR)

    return application

app = create_app()
