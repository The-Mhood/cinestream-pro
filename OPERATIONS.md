#!/bin/bash
# CineStream Operations Commands Reference

# ============================================================================
# QUICK START
# ============================================================================

# 1. Full setup and initialization
./setup.sh

# 2. Start all services
docker-compose up -d

# 3. Stop all services
docker-compose down

# 4. View real-time logs
docker-compose logs -f backend
docker-compose logs -f scraper
docker-compose logs -f frontend
docker-compose logs -f db

# ============================================================================
# DATABASE OPERATIONS
# ============================================================================

# Access database shell
docker-compose exec db psql -U user -d aggregator

# Check table row counts
docker-compose exec db psql -U user -d aggregator -c "
  SELECT 
    'movies' as table_name, COUNT(*) as row_count FROM movies
  UNION ALL
  SELECT 'stream_sources', COUNT(*) FROM stream_sources
  UNION ALL
  SELECT 'providers', COUNT(*) FROM providers
  UNION ALL
  SELECT 'users', COUNT(*) FROM users
  UNION ALL
  SELECT 'watchlists', COUNT(*) FROM watchlists;
"

# View recent movies
docker-compose exec db psql -U user -d aggregator -c "
  SELECT id, title, is_trending, rating, created_at 
  FROM movies 
  ORDER BY created_at DESC 
  LIMIT 10;
"

# View provider status
docker-compose exec db psql -U user -d aggregator -c "
  SELECT slug, name, status, avg_latency_ms, uptime_percent 
  FROM providers 
  ORDER BY uptime_percent DESC;
"

# View aggregation runs
docker-compose exec db psql -U user -d aggregator -c "
  SELECT id, started_at, status, titles_discovered, sources_verified 
  FROM aggregation_runs 
  ORDER BY started_at DESC 
  LIMIT 5;
"

# Delete all data (CAUTION!)
docker-compose exec db psql -U user -d aggregator -c "
  TRUNCATE aggregation_runs, reviews, watchlists, stream_sources, movies, providers, users CASCADE;
"

# Backup database
docker-compose exec db pg_dump -U user aggregator > backup.sql

# Restore database
docker-compose exec -T db psql -U user aggregator < backup.sql

# ============================================================================
# SCRAPER OPERATIONS
# ============================================================================

# Run scraper once (seed)
docker-compose exec scraper python -m app.services.scrapers_cli --once

# Check scraper logs
docker-compose logs -f scraper

# Run scraper with custom interval (5 minutes)
docker-compose exec scraper python -m app.services.scrapers_cli --interval 5

# View aggregation status
docker-compose exec db psql -U user -d aggregator -c "
  SELECT 
    COUNT(*) as total_runs,
    SUM(titles_discovered) as total_discovered,
    AVG(titles_discovered) as avg_per_run,
    MAX(titles_discovered) as max_run
  FROM aggregation_runs 
  WHERE status = 'completed';
"

# ============================================================================
# BACKEND API OPERATIONS
# ============================================================================

# Check API health
curl http://localhost:8000/health | jq .

# View API documentation
curl http://localhost:8000/docs

# Get API status
curl http://localhost:8000/api/status | jq .

# Test backend connectivity
docker-compose exec backend curl -s http://localhost:8000/health | jq .

# View backend logs
docker-compose logs -f backend

# ============================================================================
# REDIS CACHE OPERATIONS
# ============================================================================

# Access Redis CLI
docker-compose exec redis redis-cli

# Check Redis memory usage
docker-compose exec redis redis-cli info memory

# Monitor Redis commands (live)
docker-compose exec redis redis-cli monitor

# Clear all cache
docker-compose exec redis redis-cli FLUSHALL

# View all keys
docker-compose exec redis redis-cli KEYS "*"

# ============================================================================
# MONITORING & DEBUGGING
# ============================================================================

# View all container status
docker-compose ps

# View resource usage
docker stats

# Restart a specific service
docker-compose restart backend
docker-compose restart scraper

# View service resource limits
docker-compose exec backend cat /sys/fs/cgroup/memory/memory.limit_in_bytes

# ============================================================================
# DEVELOPMENT COMMANDS
# ============================================================================

# Rebuild all images
docker-compose build --no-cache

# Rebuild specific service
docker-compose build --no-cache backend

# Rebuild and restart service
docker-compose up -d --build backend

# View environment variables
docker-compose exec backend env | grep -E "DATABASE_URL|REDIS_URL|TMDB"

# Install new Python dependency
docker-compose exec backend pip install <package-name>

# Run migrations
docker-compose exec backend alembic upgrade head

# ============================================================================
# PRODUCTION DEPLOYMENT
# ============================================================================

# Production build (without reload)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check production health
curl -H "Authorization: Bearer $API_TOKEN" http://api.cinestream.example.com/health

# View production logs
docker-compose logs backend --tail 100 -f

# Scale services
docker-compose up -d --scale scraper=2

# ============================================================================
# CLEANUP & MAINTENANCE
# ============================================================================

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Full cleanup (CAUTION!)
docker-compose down -v

# Clean build cache
docker builder prune

# ============================================================================
# TROUBLESHOOTING
# ============================================================================

# Check if ports are in use
lsof -i :3000
lsof -i :8000
lsof -i :5432
lsof -i :6379

# Rebuild and start fresh
docker-compose down -v && docker-compose up -d

# View detailed container logs
docker-compose logs backend --timestamps

# Check container network
docker network inspect cinestream-aggregator_default

# Test database connection from backend
docker-compose exec backend python -c "
  from app.database import engine
  with engine.connect() as conn:
    print('✓ Database connected')
"

# Test Redis connection from backend
docker-compose exec backend python -c "
  from app.cache import test_redis_connection
  if test_redis_connection():
    print('✓ Redis connected')
  else:
    print('✗ Redis failed')
"
