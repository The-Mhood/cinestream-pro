"""Production-ready aggregator worker with async support."""
import os
import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
from sqlalchemy import text, and_
import httpx

from app.database import SessionLocal
from app.db_models import Movie, Provider, StreamSource, AggregationRun
from app.cache import cache_set, cache_get

logger = logging.getLogger(__name__)

# Provider Configuration
PROVIDERS_CONFIG = {
    "flixhq": {
        "url": "https://flixhq.to",
        "enabled": True,
        "timeout": 10,
        "headers": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    },
    "fmovies": {
        "url": "https://fmovies.to",
        "enabled": True,
        "timeout": 10,
        "headers": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    },
    "9movies": {
        "url": "https://9movies.to",
        "enabled": True,
        "timeout": 10,
        "headers": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    }
}

class AggregatorWorker:
    """Production aggregator with async support."""
    
    def __init__(self):
        self.session = None
        self.tmdb_api_key = os.getenv("TMDB_API_KEY", "")
        self.tmdb_base_url = "https://api.themoviedb.org/3"
    
    async def __aenter__(self):
        self.session = httpx.AsyncClient(timeout=10.0)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()
    
    def extract_movie_info(self, link_tag, provider: str) -> Optional[Dict]:
        """Extract movie metadata from a link tag."""
        try:
            title = link_tag.get_text(strip=True)
            href = link_tag.get("href", "")
            
            if not title or len(title) < 2:
                return None
            
            poster_path = ""
            img_tag = link_tag.find("img")
            if img_tag:
                poster_path = img_tag.get("src", "")
            
            return {
                "title": title.strip(),
                "poster_path": poster_path,
                "provider_name": provider,
                "url": href,
                "overview": None,
                "release_year": self._extract_year(title),
            }
        except Exception as e:
            logger.warning(f"Failed to extract movie info: {e}")
            return None
    
    def _extract_year(self, title: str) -> int:
        """Extract year from title string."""
        import re
        match = re.search(r'\((\d{4})\)', title)
        if match:
            return int(match.group(1))
        return datetime.now().year
    
    async def fetch_movie_overview(self, title: str) -> Optional[str]:
        """Fetch movie overview from TMDB API."""
        if not self.tmdb_api_key:
            return None
        
        try:
            cached = cache_get(f"tmdb_overview:{title}")
            if cached:
                return cached
            
            response = await self.session.get(
                f"{self.tmdb_base_url}/search/movie",
                params={"api_key": self.tmdb_api_key, "query": title}
            )
            
            if response.status_code == 200:
                results = response.json().get("results", [])
                if results:
                    overview = results[0].get("overview", "")
                    cache_set(f"tmdb_overview:{title}", overview, ttl=86400)
                    return overview
        except Exception as e:
            logger.warning(f"Failed to fetch TMDB overview for {title}: {e}")
        
        return None
    
    async def discover_movies_from_provider(self, provider_name: str, provider_config: Dict) -> List[Dict]:
        """Discover movies from a specific provider."""
        logger.info(f"Discovering movies from {provider_name}...")
        movies = []
        
        if not provider_config.get("enabled"):
            logger.info(f"Provider {provider_name} is disabled")
            return movies
        
        try:
            response = requests.get(
                provider_config["url"],
                headers=provider_config.get("headers", {}),
                timeout=provider_config.get("timeout", 10)
            )
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "lxml")
            movie_links = soup.find_all("a", class_="movie-link")
            
            logger.info(f"Found {len(movie_links)} potential movies on {provider_name}")
            
            for link in movie_links[:20]:  # Limit to first 20 for initial testing
                movie_data = self.extract_movie_info(link, provider_name)
                if movie_data:
                    movies.append(movie_data)
            
            logger.info(f"Extracted {len(movies)} valid movies from {provider_name}")
        
        except Exception as e:
            logger.error(f"Error discovering movies from {provider_name}: {e}")
        
        return movies
    
    async def discover_all_movies(self) -> Dict[str, int]:
        """Discover movies from all configured providers."""
        db = SessionLocal()
        results = {
            "total_discovered": 0,
            "total_added": 0,
            "providers_scanned": 0,
            "errors": []
        }
        
        try:
            for provider_name, provider_config in PROVIDERS_CONFIG.items():
                try:
                    movies = await self.discover_movies_from_provider(provider_name, provider_config)
                    results["total_discovered"] += len(movies)
                    results["providers_scanned"] += 1
                    
                    # Store movies in database
                    for movie_data in movies:
                        try:
                            self._store_movie(db, movie_data)
                            results["total_added"] += 1
                        except Exception as e:
                            logger.warning(f"Failed to store movie {movie_data.get('title')}: {e}")
                
                except Exception as e:
                    logger.error(f"Provider {provider_name} error: {e}")
                    results["errors"].append(f"{provider_name}: {str(e)}")
        
        finally:
            db.close()
        
        return results
    
    def _store_movie(self, db: Session, movie_data: Dict) -> Optional[Movie]:
        """Store movie in database."""
        try:
            # Generate slug
            slug = movie_data["title"].lower().replace(" ", "-")
            
            # Check if movie exists
            existing = db.query(Movie).filter(Movie.slug == slug).first()
            if existing:
                logger.debug(f"Movie {slug} already exists")
                return existing
            
            # Create new movie
            movie = Movie(
                slug=slug,
                title=movie_data["title"],
                type="movie",
                poster_path=movie_data.get("poster_path", ""),
                backdrop_path="",
                overview=movie_data.get("overview", ""),
                release_year=movie_data.get("release_year", datetime.now().year),
                duration_minutes=0,
                rating=0.0,
                genres="",
                discovered_via=movie_data["provider_name"],
            )
            
            db.add(movie)
            db.commit()
            db.refresh(movie)
            
            logger.info(f"Stored movie: {movie.title}")
            return movie
        
        except Exception as e:
            db.rollback()
            logger.error(f"Database error storing movie: {e}")
            raise
    
    def update_provider_status(self, db: Session, provider_slug: str, 
                              latency_ms: int, success: bool) -> None:
        """Update provider health metrics."""
        try:
            provider = db.query(Provider).filter(Provider.slug == provider_slug).first()
            if not provider:
                logger.warning(f"Provider {provider_slug} not found")
                return
            
            # Update metrics
            provider.avg_latency_ms = (provider.avg_latency_ms + latency_ms) // 2
            provider.last_checked_at = datetime.now()
            
            if success:
                provider.uptime_percent = min(100.0, provider.uptime_percent + 0.1)
            else:
                provider.uptime_percent = max(0.0, provider.uptime_percent - 1.0)
            
            db.commit()
            logger.debug(f"Updated provider {provider_slug}: latency={provider.avg_latency_ms}ms, uptime={provider.uptime_percent}%")
        
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to update provider status: {e}")
    
    def log_aggregation_run(self, db: Session, results: Dict, status: str = "completed") -> None:
        """Log aggregation run results."""
        try:
            run = AggregationRun(
                providers_scanned=results.get("providers_scanned", 0),
                titles_discovered=results.get("total_discovered", 0),
                sources_verified=results.get("total_added", 0),
                status=status,
                summary=f"Discovered {results.get('total_discovered', 0)} titles, added {results.get('total_added', 0)} to database",
                error_details="\n".join(results.get("errors", [])) if results.get("errors") else None,
                completed_at=datetime.now()
            )
            db.add(run)
            db.commit()
            logger.info(f"Logged aggregation run: {run.summary}")
        except Exception as e:
            logger.error(f"Failed to log aggregation run: {e}")


async def run_aggregation_once():
    """Run aggregation once and exit."""
    logger.info("Starting one-time aggregation...")
    
    async with AggregatorWorker() as worker:
        results = await worker.discover_all_movies()
        
        logger.info(f"Aggregation results:")
        logger.info(f"  Providers scanned: {results['providers_scanned']}")
        logger.info(f"  Total discovered: {results['total_discovered']}")
        logger.info(f"  Total added: {results['total_added']}")
        
        if results.get("errors"):
            logger.warning(f"Errors: {results['errors']}")
        
        # Log to database
        db = SessionLocal()
        try:
            worker.log_aggregation_run(db, results, status="completed")
        finally:
            db.close()
        
        return results
