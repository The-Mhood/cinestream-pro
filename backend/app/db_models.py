"""SQLAlchemy ORM models for CineStream aggregator."""
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, DateTime, Boolean, UniqueConstraint, Index
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
from datetime import datetime

Base = declarative_base()


class User(Base):
    """User model for authentication and preferences."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    watchlist = relationship("Watchlist", back_populates="user", cascade="all, delete-orphan")
    preferences = relationship("UserPreference", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_users_email_active", "email", "is_active"),
    )


class Movie(Base):
    """Movie model with comprehensive metadata."""
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    title = Column(String(500), nullable=False, index=True)
    type = Column(String(50), default="movie", nullable=False)
    poster_path = Column(String(500))
    backdrop_path = Column(String(500))
    overview = Column(Text)
    release_date = Column(DateTime)
    release_year = Column(Integer, index=True)
    duration_minutes = Column(Integer, default=0)
    rating = Column(Float, default=0.0, index=True)
    genres = Column(String(500))
    cast_list = Column(String(1000))
    tmdb_id = Column(Integer, unique=True, nullable=True, index=True)
    imdb_id = Column(String(20), nullable=True)
    is_trending = Column(Boolean, default=False, index=True)
    view_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    sources = relationship("StreamSource", back_populates="movie", cascade="all, delete-orphan")
    watchlists = relationship("Watchlist", back_populates="movie", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="movie", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("title", "release_year", name="uq_movie_title_year"),
        Index("idx_movies_title_year", "title", "release_year"),
        Index("idx_movies_trending_rating", "is_trending", "rating"),
    )

    def __repr__(self):
        return f"<Movie(id={self.id}, title={self.title}, tmdb_id={self.tmdb_id})>"


class StreamSource(Base):
    """Stream source model for tracking available streams."""
    __tablename__ = "stream_sources"

    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_id = Column(Integer, ForeignKey("providers.id", ondelete="SET NULL"), nullable=True)
    provider_name = Column(String(255), nullable=False, index=True)
    server_label = Column(String(255))
    url = Column(String(1000), nullable=False)
    quality = Column(String(50), default="720p", index=True)
    format = Column(String(50), default="HLS")
    language = Column(String(50), default="English")
    season = Column(Integer, default=1)
    episode = Column(Integer, default=1)
    is_active = Column(Boolean, default=True, index=True)
    status = Column(String(50), default="active")
    last_verified_at = Column(DateTime, server_default=func.now())
    last_played = Column(DateTime)
    success_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    movie = relationship("Movie", back_populates="sources")
    provider = relationship("Provider", back_populates="sources")

    __table_args__ = (
        UniqueConstraint("movie_id", "provider_name", "url", name="uq_source_movie_provider_url"),
        Index("idx_sources_movie_active", "movie_id", "is_active"),
        Index("idx_sources_quality_status", "quality", "status"),
    )

    def __repr__(self):
        return f"<StreamSource(id={self.id}, movie_id={self.movie_id}, provider={self.provider_name})>"


class Provider(Base):
    """Provider/platform model for tracking streaming sources."""
    __tablename__ = "providers"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    base_url = Column(String(500), nullable=False)
    status = Column(String(50), default="active", index=True)
    avg_latency_ms = Column(Integer, default=0)
    uptime_percent = Column(Float, default=99.0)
    total_streams_indexed = Column(Integer, default=0)
    last_checked_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    sources = relationship("StreamSource", back_populates="provider")

    __table_args__ = (
        Index("idx_providers_status", "status"),
    )

    def __repr__(self):
        return f"<Provider(id={self.id}, name={self.name}, uptime={self.uptime_percent}%)>"


class Watchlist(Base):
    """User watchlist model for tracking watched and to-watch movies."""
    __tablename__ = "watchlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default="to_watch", index=True)  # to_watch, watching, completed
    progress_seconds = Column(Integer, default=0)
    last_watched_at = Column(DateTime)
    watched_at = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="watchlist")
    movie = relationship("Movie", back_populates="watchlists")

    __table_args__ = (
        UniqueConstraint("user_id", "movie_id", name="uq_watchlist_user_movie"),
        Index("idx_watchlist_user_status", "user_id", "status"),
        Index("idx_watchlist_movie_status", "movie_id", "status"),
    )

    def __repr__(self):
        return f"<Watchlist(user_id={self.user_id}, movie_id={self.movie_id}, status={self.status})>"


class Review(Base):
    """User review model for movie ratings and comments."""
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    movie_id = Column(Integer, ForeignKey("movies.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = Column(Integer, nullable=False)  # 1-5 or 1-10
    comment = Column(Text)
    is_spoiler = Column(Boolean, default=False)
    helpful_count = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    movie = relationship("Movie", back_populates="reviews")

    __table_args__ = (
        UniqueConstraint("user_id", "movie_id", name="uq_review_user_movie"),
        Index("idx_reviews_movie_rating", "movie_id", "rating"),
    )

    def __repr__(self):
        return f"<Review(user_id={self.user_id}, movie_id={self.movie_id}, rating={self.rating})>"


class UserPreference(Base):
    """User preference model for personalization."""
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    preferred_quality = Column(String(50), default="1080p")
    preferred_language = Column(String(50), default="English")
    auto_play_next = Column(Boolean, default=False)
    dark_mode = Column(Boolean, default=True)
    notifications_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="preferences", uselist=False)

    def __repr__(self):
        return f"<UserPreference(user_id={self.user_id})>"


class AggregationRun(Base):
    """Track aggregation job runs for monitoring."""
    __tablename__ = "aggregation_runs"

    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime, server_default=func.now(), nullable=False)
    completed_at = Column(DateTime)
    providers_scanned = Column(Integer, default=0)
    titles_discovered = Column(Integer, default=0)
    sources_verified = Column(Integer, default=0)
    status = Column(String(50), default="in_progress", index=True)
    summary = Column(Text)
    error_details = Column(Text)

    __table_args__ = (
        Index("idx_aggregation_status_created", "status", "started_at"),
    )

    def __repr__(self):
        return f"<AggregationRun(id={self.id}, status={self.status}, discovered={self.titles_discovered})>"
