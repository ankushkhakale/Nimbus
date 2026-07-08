from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Literal
import logging
from app.database.mongodb import db

router = APIRouter()
logger = logging.getLogger(__name__)

class HealthCheckResponse(BaseModel):
    status: Literal["ok", "error"]
    mongodb: Literal["connected", "disconnected"]

@router.get("/health", response_model=HealthCheckResponse, status_code=status.HTTP_200_OK)
async def health_check():
    """
    Health check endpoint to verify API and MongoDB connectivity.
    """
    mongodb_status = "disconnected"
    response_status = "error"
    
    try:
        # Check if client is initialized
        if db.client is not None:
            # Ping the database
            await db.client.admin.command('ping')
            mongodb_status = "connected"
            response_status = "ok"
    except Exception as e:
        logger.error(f"Health check failed to connect to MongoDB: {e}")
    
    if response_status == "error":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "error", "mongodb": mongodb_status}
        )
        
    return HealthCheckResponse(status=response_status, mongodb=mongodb_status)
