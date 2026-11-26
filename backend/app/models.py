"""FastAPI models."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class MediaItem(BaseModel):
    """Media item model."""
    id: int
    slug: str
    title: str
    type: str = Field(..., description="movie or series")
    poster_path: str
    backdrop_path: str
    overview: str
    release_year: int
    duration_minutes: int
    rating: float
    genres: str
    is_trending: bool = False
    
    class Config:
        from_attributes = True

class StreamSource(BaseModel):
    """Stream source model."""
    id: int
    media_id: int
    provider_name: str
    server_label: str
    url: str
    quality: str
    format: str = "HLS"
    language: str
    status: str = "active"
    latency_ms: int
    
    class Config:
        from_attributes = True

class Provider(BaseModel):
    """Provider model."""
    id: int
    slug: str
    name: str
    base_url: str
    status: str = "active"
    avg_latency_ms: int
    uptime_percent: float
    total_streams_indexed: int
    
    class Config:
        from_attributes = True

class HealthCheck(BaseModel):
    """Health check response."""
    status: str
    version: str
    service: str
    timestamp: datetime = Field(default_factory=datetime.now)
