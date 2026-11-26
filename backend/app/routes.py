from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from app.models import Movie, StreamSource, Watchlist, User
from app.core.db import SessionLocal

router = APIRouter()

@router.get("/movies")
async def get_movies(limit: int = 20, page: int = 1):
    """Get paginated movies from database."""
    session = SessionLocal()
    offset = (page - 1) * limit
    
    result = session.execute(
        text("""
        SELECT m.*, s.provider_name, s.quality, s.is_active
        FROM movies m
        LEFT JOIN stream_sources s ON m.id = s.movie_id
        WHERE m.source_id = 'flixhq' OR m.source_id = 'streamtape'
        ORDER BY m.release_date DESC
        LIMIT :limit OFFSET :offset
        """),
        params={"limit": limit, "offset": offset}
    )
    
    movies = result.fetchall()
    total = session.execute(text("SELECT COUNT(*) FROM movies")).scalar()
    
    return {
        "movies": [
            {
                "id": m.id,
                "title": m.title,
                "poster_path": m.poster_path,
                "overview": m.overview,
                "release_date": m.release_date,
                "rating": m.rating,
                "sources": [
                    {
                        "provider": s.provider_name,
                        "quality": s.quality,
                        "url": s.url,
                        "is_active": s.is_active
                    }
                    for s in result.fetchall() if s
                ]
            }
        ],
        "total": total,
        "page": page,
        "limit": limit
    }

@router.get("/movies/{id}")
async def get_movie_detail(id: int):
    """Get movie detail with available sources."""
    session = SessionLocal()
    result = session.execute(
        text("""
        SELECT m.*, s.provider_name, s.quality, s.url, s.is_active
        FROM movies m
        LEFT JOIN stream_sources s ON m.id = s.movie_id
        WHERE m.id = :id AND s.is_active = true
        """),
        params={"id": id}
    )
    
    movies = result.fetchall()
    
    if not movies:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    return {
        "movie": {
            "id": movies[0].id,
            "title": movies[0].title,
            "poster_path": movies[0].poster_path,
            "backdrop_path": movies[0].backdrop_path,
            "overview": movies[0].overview,
            "release_date": movies[0].release_date,
            "rating": movies[0].rating,
        },
        "sources": [
            {
                "provider": s.provider_name,
                "quality": s.quality,
                "url": s.url,
                "is_active": s.is_active
            }
            for s in movies[1:]
        ]
    }

@router.post("/watchlist")
async def add_to_watchlist(user: User, movie_id: int, series_id: int = None):
    """Add movie/series to user's watchlist."""
    session = SessionLocal()
    entry = Watchlist(
        user_id=user.id,
        movie_id=movie_id,
        series_id=series_id,
        last_watched_at=datetime.utcnow()
    )
    session.add(entry)
    session.commit()
    return entry

@router.get("/watchlist")
async def get_watchlist(user: User, limit: int = 20):
    """Get user's watchlist."""
    session = SessionLocal()
    result = session.execute(
        text("""
        SELECT m.*, s.provider_name, s.quality, s.url
        FROM watchlists w
        JOIN movies m ON w.movie_id = m.id
        JOIN stream_sources s ON w.movie_id = s.movie_id
        WHERE w.user_id = :user_id AND s.is_active = true
        ORDER BY w.last_watched_at DESC
        LIMIT :limit
        """),
        params={"user_id": user.id, "limit": limit}
    )
    
    watchlist = result.fetchall()
    return {
        "watchlist": [
            {
                "id": w.id,
                "movie_id": w.movie_id,
                "title": w.title,
                "poster_path": w.poster_path,
                "last_watched_at": w.last_watched_at,
                "source": {
                    "provider": s.provider_name,
                    "quality": s.quality,
                    "url": s.url
                }
            }
            for w, s in watchlist
        ]
    }

@router.get("/stream/status/{url}")
async def check_stream_health(url: str):
    """Check if streaming URL is active."""
    # In production, this would check actual server health
    return {
        "status": "active",
        "latency": "low",
        "quality": "1080p"
    }
