"""FastAPI models."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    watchlist = relationship("Watchlist", back_populates="user")

class Movie(Base):
    __tablename__ = "movies"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True)
    poster_path = Column(String)
    backdrop_path = Column(String)
    overview = Column(Text)
    release_date = Column(DateTime)
    rating = Column(Float, default=0.0)
    tmdb_id = Column(Integer, unique=True, nullable=True)
    
    sources = relationship("StreamSource", back_populates="movie")
    watchlists = relationship("Watchlist", foreign_keys="Watchlist.movie_id", back_populates="movie")

class Series(Base):
    __tablename__ = "series"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True)
    poster_path = Column(String)
    backdrop_path = Column(String)
    overview = Column(Text)
    season = Column(Integer)
    episode = Column(Integer)
    tmdb_id = Column(Integer, unique=True, nullable=True)
    sources = relationship("StreamSource", back_populates="series")

class StreamSource(Base):
    __tablename__ = "stream_sources"
    id = Column(Integer, primary_key=True, index=True)
    movie_id = Column(Integer, ForeignKey("movies.id"))
    series_id = Column(Integer, ForeignKey("series.id"))
    provider_name = Column(String)
    url = Column(String)
    quality = Column(String, default="720p")
    format = Column(String, default="HLS")
    is_active = Column(Boolean, default=True)
    last_played = Column(DateTime)
    success_count = Column(Integer, default=0)
    
    movie = relationship("Movie", back_populates="sources")
    series = relationship("Series", back_populates="sources")

class Watchlist(Base):
    __tablename__ = "watchlists"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    movie_id = Column(Integer, ForeignKey("movies.id"))
    series_id = Column(Integer, ForeignKey("series.id"))
    last_watched_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="watchlist")
    movie = relationship("Movie", foreign_keys=[movie_id], back_populates="watchlists")
    series = relationship("Series", foreign_keys=[series_id], back_populates="watchlists")
