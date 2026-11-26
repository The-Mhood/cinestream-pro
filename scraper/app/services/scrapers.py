"""Media scraper service."""
import logging
from datetime import datetime
from app.db import Database

logger = logging.getLogger(__name__)


SAMPLE_MEDIA = [
    {
        "slug": "sintel",
        "title": "Sintel",
        "type": "movie",
        "poster_path": "/posters/sintel.jpg",
        "backdrop_path": "/posters/sintel.jpg",
        "overview": "A wandering warrior named Sintel treks across frozen mountain passes and ancient ruins in search of a young dragon she once rescued, uncovering a heartbreaking truth at the edge of the world.",
        "release_year": 2010,
        "duration_minutes": 15,
        "rating": 8.9,
        "genres": "Fantasy, Adventure, Drama",
        "cast_list": "Halina Reijn, Thom Hoffman",
        "seasons_count": 1,
        "episodes_count": 1,
        "tmdb_id": 45745,
        "is_trending": True,
        "discovered_via": "OpenArchive + 3 mirrors",
    },
    {
        "slug": "tears-of-steel",
        "title": "Tears of Steel",
        "type": "movie",
        "poster_path": "/posters/tears-of-steel.jpg",
        "backdrop_path": "/posters/hero-backdrop.jpg",
        "overview": "In a dystopian future Amsterdam, a band of cybernetic warriors and scientists gather at the Oude Kerk to stage a desperate stand against robotic dominance.",
        "release_year": 2012,
        "duration_minutes": 12,
        "rating": 8.8,
        "genres": "Sci-Fi, Cyberpunk, Action",
        "cast_list": "Derek de Lint, Sergio Hasselbaink, Rogier Schippers",
        "seasons_count": 1,
        "episodes_count": 1,
        "tmdb_id": 118193,
        "is_trending": True,
        "discovered_via": "Unified CDN + 3 mirrors",
    },
    {
        "slug": "big-buck-bunny",
        "title": "Big Buck Bunny",
        "type": "movie",
        "poster_path": "/posters/big-buck-bunny.jpg",
        "backdrop_path": "/posters/big-buck-bunny.jpg",
        "overview": "A peaceful giant rabbit living in a sunlit redwood meadow finally snaps and orchestrates an elaborate forest counter-ambush.",
        "release_year": 2008,
        "duration_minutes": 10,
        "rating": 8.3,
        "genres": "Animation, Comedy, Adventure",
        "cast_list": "Bunny, Frank, Rinky, Gamera",
        "seasons_count": 1,
        "episodes_count": 1,
        "tmdb_id": 10378,
        "is_trending": True,
        "discovered_via": "Mux Edge + 3 mirrors",
    },
]

SAMPLE_PROVIDERS = [
    {
        "slug": "openarchive",
        "name": "OpenArchive",
        "base_url": "https://openarchive.example.com",
        "status": "active",
        "avg_latency_ms": 42,
        "uptime_percent": 99.5,
        "total_streams_indexed": 1250,
    },
    {
        "slug": "mux-edge",
        "name": "Mux Edge",
        "base_url": "https://mux.example.com",
        "status": "active",
        "avg_latency_ms": 35,
        "uptime_percent": 99.8,
        "total_streams_indexed": 2100,
    },
    {
        "slug": "cupertino-hls",
        "name": "Cupertino HLS",
        "base_url": "https://cupertino.example.com",
        "status": "active",
        "avg_latency_ms": 48,
        "uptime_percent": 99.2,
        "total_streams_indexed": 890,
    },
]


class MediaScraper:
    def __init__(self):
        self.db = Database()
    
    def seed_database(self):
        """Seed database with sample media and providers."""
        try:
            # Insert providers (skip duplicates)
            logger.info("Inserting providers...")
            for provider in SAMPLE_PROVIDERS:
                try:
                    self.db.insert('providers', provider)
                except Exception as e:
                    if 'duplicate' in str(e).lower():
                        logger.info(f"Provider {provider['slug']} already exists, skipping")
                    else:
                        raise
            logger.info(f"Inserted/verified {len(SAMPLE_PROVIDERS)} providers")
            
            # Insert media items (skip duplicates)
            logger.info("Inserting media items...")
            for media in SAMPLE_MEDIA:
                try:
                    self.db.insert('media_items', media)
                except Exception as e:
                    if 'duplicate' in str(e).lower():
                        logger.info(f"Media {media['slug']} already exists, skipping")
                    else:
                        raise
            logger.info(f"Inserted/verified {len(SAMPLE_MEDIA)} media items")
            
            # Insert sample stream sources (skip if already exist)
            logger.info("Inserting stream sources...")
            self.db.execute("""
                INSERT INTO stream_sources 
                (media_id, provider_id, provider_name, server_label, url, quality, format, language, status, is_active)
                SELECT m.id, p.id, p.name, 'Primary', 'https://stream.example.com/hls/manifest.m3u8', '1080p', 'HLS', 'English', 'active', true
                FROM media_items m, providers p
                WHERE m.slug = 'sintel' AND p.slug = 'openarchive'
                AND NOT EXISTS (
                  SELECT 1 FROM stream_sources ss 
                  WHERE ss.media_id = m.id AND ss.provider_id = p.id
                )
                LIMIT 1
            """)
            logger.info("Seeding complete!")
            
        except Exception as e:
            logger.error(f"Seeding error: {e}")
            raise
        finally:
            self.db.close()
    
    def scrape_sources(self):
        """Scrape media sources from providers."""
        logger.info("Scraping media sources...")
        # Placeholder for actual scraping logic
        logger.info("Scraping complete!")
        self.db.close()
