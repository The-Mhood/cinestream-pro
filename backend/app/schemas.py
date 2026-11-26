"""Pydantic schemas for FastAPI request/response validation."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class WatchlistStatus(str, Enum):
    """Watchlist status enum."""
    TO_WATCH = "to_watch"
    WATCHING = "watching"
    COMPLETED = "completed"


class StreamQuality(str, Enum):
    """Available stream qualities."""
    SD = "480p"
    HD = "720p"
    FULL_HD = "1080p"
    ULTRA_HD = "4K"


# User Schemas
class UserCreate(BaseModel):
    """Create user schema."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserUpdate(BaseModel):
    """Update user schema."""
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserResponse(BaseModel):
    """User response schema."""
    id: int
    email: str
    username: str
    full_name: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserPreferenceResponse(BaseModel):
    """User preference response schema."""
    id: int
    user_id: int
    preferred_quality: str
    preferred_language: str
    auto_play_next: bool
    dark_mode: bool
    notifications_enabled: bool

    class Config:
        from_attributes = True


# Movie Schemas
class MovieBase(BaseModel):
    """Base movie schema."""
    title: str
    type: str = "movie"
    overview: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    release_date: Optional[datetime] = None
    release_year: Optional[int] = None
    duration_minutes: int = 0
    rating: float = 0.0
    genres: Optional[str] = None
    cast_list: Optional[str] = None
    tmdb_id: Optional[int] = None
    imdb_id: Optional[str] = None


class MovieCreate(MovieBase):
    """Create movie schema."""
    slug: str = Field(..., description="URL-friendly slug")


class MovieUpdate(BaseModel):
    """Update movie schema."""
    title: Optional[str] = None
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    overview: Optional[str] = None
    rating: Optional[float] = None
    is_trending: Optional[bool] = None


class MovieResponse(MovieBase):
    """Movie response schema."""
    id: int
    slug: str
    is_trending: bool
    view_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MovieDetailResponse(MovieResponse):
    """Detailed movie response with relations."""
    sources: List["StreamSourceResponse"] = []
    reviews: List["ReviewResponse"] = []


# Provider Schemas
class ProviderResponse(BaseModel):
    """Provider response schema."""
    id: int
    slug: str
    name: str
    base_url: str
    status: str
    avg_latency_ms: int
    uptime_percent: float
    total_streams_indexed: int

    class Config:
        from_attributes = True


# Stream Source Schemas
class StreamSourceBase(BaseModel):
    """Base stream source schema."""
    provider_name: str
    server_label: Optional[str] = None
    url: str
    quality: str = "720p"
    format: str = "HLS"
    language: str = "English"
    season: int = 1
    episode: int = 1


class StreamSourceCreate(StreamSourceBase):
    """Create stream source schema."""
    movie_id: int
    provider_id: Optional[int] = None


class StreamSourceResponse(StreamSourceBase):
    """Stream source response schema."""
    id: int
    movie_id: int
    is_active: bool
    status: str
    success_count: int
    fail_count: int
    latency_ms: int
    last_verified_at: datetime
    last_played: Optional[datetime] = None

    class Config:
        from_attributes = True


# Watchlist Schemas
class WatchlistCreate(BaseModel):
    """Create watchlist item schema."""
    movie_id: int
    status: WatchlistStatus = WatchlistStatus.TO_WATCH


class WatchlistUpdate(BaseModel):
    """Update watchlist item schema."""
    status: Optional[WatchlistStatus] = None
    progress_seconds: Optional[int] = None


class WatchlistResponse(BaseModel):
    """Watchlist response schema."""
    id: int
    user_id: int
    movie_id: int
    status: str
    progress_seconds: int
    last_watched_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WatchlistWithMovieResponse(WatchlistResponse):
    """Watchlist response with movie details."""
    movie: MovieResponse


# Review Schemas
class ReviewCreate(BaseModel):
    """Create review schema."""
    movie_id: int
    rating: int = Field(..., ge=1, le=10)
    comment: Optional[str] = None
    is_spoiler: bool = False


class ReviewUpdate(BaseModel):
    """Update review schema."""
    rating: Optional[int] = Field(None, ge=1, le=10)
    comment: Optional[str] = None
    is_spoiler: Optional[bool] = None


class ReviewResponse(BaseModel):
    """Review response schema."""
    id: int
    user_id: int
    movie_id: int
    rating: int
    comment: Optional[str] = None
    is_spoiler: bool
    helpful_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# Health & Status Schemas
class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str = "2.0.0"
    service: str = "CineStream API"
    timestamp: datetime = Field(default_factory=datetime.now)
    database: str = "connected"
    cache: str = "connected"


class AggregationRunResponse(BaseModel):
    """Aggregation run response schema."""
    id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    providers_scanned: int
    titles_discovered: int
    sources_verified: int
    status: str
    summary: Optional[str] = None
    error_details: Optional[str] = None

    class Config:
        from_attributes = True


# Pagination Schema
class PaginationParams(BaseModel):
    """Pagination parameters."""
    skip: int = Field(0, ge=0)
    limit: int = Field(20, ge=1, le=100)


class PaginatedResponse(BaseModel):
    """Generic paginated response."""
    total: int
    skip: int
    limit: int
    items: List


# Update forward references
MovieDetailResponse.model_rebuild()
