from fastapi import APIRouter
from app.api.endpoints import auth, files, health, shares

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(shares.router, prefix="/shares", tags=["shares"])
