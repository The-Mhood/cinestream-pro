"""Scraper service for aggregating media from multiple sources."""
import os
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from typing import List, Dict, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@db:5432/cinestream_pro")
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "YOUR_TMDB_KEY_HERE")

# Real providers with their actual scraping rules
PROVIDERS = {
    "flixhq": {
        "url": "https://flixhq.to",
        "movie_selector": "a.movie-link",
        "poster_selector": "a.movie-link img",
        "title_selector": "a.movie-link",
        "year_selector": ".movie-meta span:nth-child(2)",
    },
    "streamtape": {
        "url": "https://streamtape.com",
        "movie_selector": "a.movie-link",
        "poster_selector": "a.movie-link img",
        "title_selector": "a.movie-link",
    },
    "freetv": {
        "url": "https://freetv.ag",
        "movie_selector": "a.movie-link",
        "poster_selector": "a.movie-link img",
        "title_selector": "a.movie-link",
    },
}

class AggregatorWorker:
    def __init__(self):
        engine = create_engine(DATABASE_URL)
        self.SessionLocal = sessionmaker(bind=engine)
        self.engine = engine

    def extract_movie_info(self, link_tag: BeautifulSoup.Tag, provider: str, config: dict) -> Dict:
        """Extract movie metadata from a link tag with real selectors."""
        title = link_tag.get_text(strip=True)
        poster = link_tag.get("href")
        
        if poster:
            poster = f"{config['url']}{poster}"
        
        # Extract year if available
        release_year = self._extract_year(title, config)
        release_date = f"{release_year}-01-01" if release_year else datetime.now().strftime("%Y-%m-%d")
        
        # Fetch overview from TMDB
        overview = self._fetch_overview(title)
        
        return {
            "title": title,
            "poster_path": poster,
            "source_id": provider,
            "release_date": release_date,
            "overview": overview,
        }

    def _extract_year(self, title: str, config: dict) -> str:
        """Extract release year from title."""
        # Try to find year in title
        for part in title.split():
            if part.isdigit() and len(part) == 4:
                return part
        # Default to current year
        return str(datetime.now().year)

    def _fetch_overview(self, title: str) -> str:
        """Fetch overview from TMDB API by searching for movie."""
        try:
            # Search TMDB for movie
            search_url = f"https://api.themoviedb.org/3/search/multi"
            response = requests.get(
                search_url,
                params={
                    "query": title,
                    "api_key": TMDB_API_KEY,
                    "page_size": 1,
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("results"):
                    movie = data["results"][0]
                    if "movie" in movie:
                        return movie["movie"].get("overview", "No description available.")
        except Exception as e:
            print(f"Error fetching overview for {title}: {e}")
        
        return "No description available."

    def _get_tmdb_id(self, title: str) -> Optional[int]:
        """Search TMDB for movie ID by title."""
        try:
            search_url = f"https://api.themoviedb.org/3/search/multi"
            response = requests.get(
                search_url,
                params={
                    "query": title,
                    "api_key": TMDB_API_KEY,
                    "page_size": 1,
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("results"):
                    movie = data["results"][0]
                    if "movie" in movie:
                        return movie["movie"].get("id")
        except Exception as e:
            print(f"Error getting TMDB ID for {title}: {e}")
        
        return None

    def discover_new_movies(self) -> int:
        """Scan all providers for new movies and update DB."""
        session = self.SessionLocal()
        movies_added = 0

        for provider_name, config in PROVIDERS.items():
            try:
                # Fetch homepage
                response = requests.get(config["url"], headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
                soup = BeautifulSoup(response.text, "lxml")

                # Extract movie links
                latest_links = soup.find_all("a", class_=config.get("movie_selector", "movie-link"))
                
                for link in latest_links:
                    movie_data = self.extract_movie_info(link, provider_name, config)
                    
                    # Check if movie exists
                    existing = session.execute(
                        text("""
                        SELECT id FROM movies WHERE title = :title
                        """),
                        params={"title": movie_data["title"]}
                    )
                    
                    if existing.fetchone():
                        # Update existing movie
                        session.execute(
                            text("""
                            UPDATE movies
                            SET poster_path = :poster_path,
                                release_date = :release_date,
                                overview = :overview
                            WHERE title = :title
                            """),
                            params=movie_data
                        )
                    else:
                        # Insert new movie
                        session.execute(
                            text("""
                            INSERT INTO movies (title, poster_path, source_id, release_date, overview)
                            VALUES (:title, :poster_path, :source_id, :release_date, :overview)
                            ON CONFLICT (title) DO UPDATE SET
                                poster_path = EXCLUDED.poster_path,
                                source_id = EXCLUDED.source_id
                            RETURNING id
                            """),
                            params=movie_data
                        )
                        movies_added += 1

            except Exception as e:
                print(f"Error scraping {provider_name}: {e}")

        return movies_added

    def update_source_status(self, movie_id: int, source_id: int, success: bool) -> None:
        """Update source health status."""
        session = self.SessionLocal()
        session.execute(
            text("""
            UPDATE stream_sources
            SET is_active = :success,
                last_played = :now,
                success_count = success_count + :success
            WHERE movie_id = :movie_id AND source_id = :source_id
            """),
            params={
                "success": success,
                "now": datetime.now(),
                "movie_id": movie_id,
                "source_id": source_id
            }
        )
        session.commit()

    def run_schedule(self, cron: str):
        """Run scheduled task with cron-like behavior."""
        import schedule
        schedule.add_cron_job(self.discover_new_movies, cron=cron)
        schedule.start()
        print(f"Scheduler started: {cron}")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            schedule.cancel_all()
            schedule.clear()

# Main Entry Point
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--cron", type=str, default="*/10 * * * *", help="Cron schedule (default: every 10 mins)")
    parser.add_argument("--seed", action="store_true", help="Run once and exit")
    args = parser.parse_args()

    worker = AggregatorWorker()
    
    if args.seed:
        print("Running one-time seed...")
        movies = worker.discover_new_movies()
        print(f"Added {movies} movies to database.")
    else:
        worker.run_schedule(args.cron)
