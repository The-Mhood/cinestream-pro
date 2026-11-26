"""Redis connection and utilities."""
import os
import logging
from redis import Redis, ConnectionPool
from redis.exceptions import ConnectionError

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Create connection pool
pool = ConnectionPool.from_url(REDIS_URL, decode_responses=True)
redis_client = Redis(connection_pool=pool)

def test_redis_connection():
    """Test Redis connection."""
    try:
        redis_client.ping()
        logger.info("Redis connection successful")
        return True
    except ConnectionError as e:
        logger.error(f"Redis connection failed: {e}")
        return False

def cache_set(key: str, value: str, ttl: int = 3600):
    """Set value in Redis cache with TTL."""
    try:
        redis_client.setex(key, ttl, value)
    except Exception as e:
        logger.error(f"Failed to set cache: {e}")

def cache_get(key: str):
    """Get value from Redis cache."""
    try:
        return redis_client.get(key)
    except Exception as e:
        logger.error(f"Failed to get cache: {e}")
        return None
