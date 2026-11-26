# CineStream Aggregator - Complete Setup Guide

A production-ready multi-source streaming aggregator with adaptive HLS playback, real-time health monitoring, and automatic server failover.

## 🚀 Quick Start

### 1. Prerequisites
- Docker & Docker Compose 2.0+
- 4GB RAM minimum
- 2GB free disk space

### 2. Clone & Setup
```bash
# Clone repository
git clone <repo-url> && cd cinestream-aggregator

# Make setup script executable
chmod +x setup.sh

# Run complete setup
./setup.sh
```

### 3. Access Services
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **Database**: localhost:5432 (user: `user`, password: `pass`)
- **Redis**: localhost:6379

---

## 📋 Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CineStream Stack                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Frontend (Next.js:3000)                                    │
│      ↓                                                      │
│  Backend API (FastAPI:8000)  ←→  Redis (6379)             │
│      ↓                                                      │
│  PostgreSQL (5432)                                          │
│      ↑                                                      │
│  Scraper Worker (Scheduler)                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Common Operations

### Start/Stop Services
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: data loss)
docker-compose down -v
```

### View Logs
```bash
# Real-time backend logs
docker-compose logs -f backend

# Real-time scraper logs
docker-compose logs -f scraper

# View last 100 lines
docker-compose logs backend --tail 100
```

### Database Access
```bash
# Open database shell
docker-compose exec db psql -U user -d aggregator

# Check table row counts
docker-compose exec db psql -U user -d aggregator -c \
  "SELECT 'movies' as table, COUNT(*) FROM movies;"

# View recent movies
docker-compose exec db psql -U user -d aggregator -c \
  "SELECT title, rating, is_trending FROM movies LIMIT 10;"
```

### Scraper Management
```bash
# Run aggregation once (seed)
docker-compose exec scraper python -m app.services.scrapers_cli --once

# Check aggregator status
docker-compose exec scraper python -m app.services.scrapers_cli --status

# View recent aggregation logs
docker-compose exec scraper python -m app.services.scrapers_cli --logs --hours 2

# View real-time scraper logs
docker-compose logs -f scraper
```

### API Testing
```bash
# Check health status
curl http://localhost:8000/health | jq .

# Get API status
curl http://localhost:8000/api/status | jq .

# Browse interactive API docs
open http://localhost:8000/docs
```

### Redis Cache
```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Check memory usage
docker-compose exec redis redis-cli INFO memory

# Clear all cache
docker-compose exec redis redis-cli FLUSHALL

# View cache keys
docker-compose exec redis redis-cli KEYS "*"
```

---

## 📊 Monitoring & Debugging

### Service Health
```bash
# Check all services
docker-compose ps

# View resource usage
docker stats

# Check specific service logs with timestamps
docker-compose logs backend --timestamps
```

### Database Health
```bash
# View aggregation run history
docker-compose exec db psql -U user -d aggregator -c \
  "SELECT id, started_at, status, titles_discovered FROM aggregation_runs ORDER BY started_at DESC LIMIT 10;"

# View provider uptime
docker-compose exec db psql -U user -d aggregator -c \
  "SELECT slug, name, status, uptime_percent, avg_latency_ms FROM providers;"

# Count movies by trending
docker-compose exec db psql -U user -d aggregator -c \
  "SELECT is_trending, COUNT(*) FROM movies GROUP BY is_trending;"
```

### Troubleshooting
```bash
# Check if ports are available
lsof -i :3000
lsof -i :8000
lsof -i :5432

# Test database connection
docker-compose exec backend python -c \
  "from app.database import engine; print('✓ Connected' if engine.connect() else '✗ Failed')"

# Test Redis connection
docker-compose exec backend python -c \
  "from app.cache import test_redis_connection; test_redis_connection()"

# Full reset (WARNING: loses data)
docker-compose down -v && rm -rf volumes/ && docker-compose up -d
```

---

## 🔧 Configuration

### Environment Variables (.env)
```env
# Database
DATABASE_URL=postgresql://user:pass@db:5432/aggregator

# Redis
REDIS_URL=redis://redis:6379

# APIs
TMDB_API_KEY=your_tmdb_api_key

# Outbound stream health checks: exact HTTPS hostnames only
STREAM_PROBE_ALLOWED_HOSTS=media.example.org,cdn.example.org

# Recursive security discovery: domains you own or are authorized to assess
DISCOVERY_ALLOWED_HOSTS=media.example.org,cdn.example.org
DISCOVERY_API_KEY=generate-a-long-random-secret
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Services
LOG_LEVEL=info
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Docker Compose Override
Create `docker-compose.override.yml` for local development:
```yaml
version: '3.8'
services:
  backend:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app
```

---

## 📦 Deployment

### Production Setup
```bash
# Use production compose file
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check health
curl https://api.example.com/health
```

### Scaling
```bash
# Run multiple scraper instances
docker-compose up -d --scale scraper=3
```

### Backup & Restore
```bash
# Backup database
docker-compose exec db pg_dump -U user aggregator > backup.sql

# Restore database
docker-compose exec -T db psql -U user aggregator < backup.sql
```

---

## 🐛 Common Issues

### Port Already in Use
```bash
# Kill process using port 8000
kill -9 $(lsof -t -i:8000)

# Or use different port in docker-compose.override.yml
```

### Database Connection Error
```bash
# Wait for postgres to be ready (up to 30s)
docker-compose exec db pg_isready -U user

# Check database logs
docker-compose logs db
```

### Scraper Not Running
```bash
# Check scraper logs
docker-compose logs scraper

# Run once manually
docker-compose exec scraper python -m app.services.scrapers_cli --once

# Check aggregation status
docker-compose exec scraper python -m app.services.scrapers_cli --status
```

### Out of Memory
```bash
# Check memory limits
docker stats

# Adjust in docker-compose.yml
# deploy:
#   resources:
#     limits:
#       memory: 2G
```

---

## 📚 API Documentation

### Available Endpoints

**Health & Status**
- `GET /health` - Health check
- `GET /api/status` - API status

**Movies**
- `GET /api/movies` - List movies (paginated)
- `GET /api/movies/{id}` - Get movie details
- `POST /api/movies` - Create movie
- `PUT /api/movies/{id}` - Update movie

**Streaming**
- `GET /api/movies/{id}/sources` - List stream sources
- `GET /api/providers` - List providers

**Watchlist**
- `POST /api/watchlist` - Add to watchlist
- `GET /api/watchlist` - Get user watchlist
- `DELETE /api/watchlist/{id}` - Remove from watchlist

See http://localhost:8000/docs for interactive API documentation.

---

## 📝 Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── database.py          # DB config
│   │   ├── cache.py             # Redis client
│   │   ├── db_models.py         # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   └── services/
│   │       ├── aggregator.py    # Scraper logic
│   │       └── scrapers_cli.py  # CLI commands
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── setup.sh                      # Setup script
├── OPERATIONS.md                 # Operations guide
└── README.md                     # This file
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test locally with `docker-compose`
4. Submit a pull request

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🆘 Support

- **Issues**: Create GitHub issue
- **Docs**: See `OPERATIONS.md` for detailed commands
- **API Docs**: http://localhost:8000/docs
- **Email**: support@cinestream.example.com

---

## 🚀 Next Steps

1. ✅ Run `./setup.sh` - Initialize all services
2. ✅ Check `http://localhost:3000` - View frontend
3. ✅ Check `http://localhost:8000/docs` - API documentation
4. ✅ Run aggregation - `docker-compose exec scraper python -m app.services.scrapers_cli --once`
5. ✅ Monitor status - `docker-compose exec scraper python -m app.services.scrapers_cli --status`
6. ✅ View logs - `docker-compose logs -f scraper`
7. ✅ Customize `TMDB_API_KEY` in `.env` for enriched metadata

---

**Last Updated**: 2024
**Version**: 2.0.0


---

## Authorized Website Discovery

The backend includes a bounded crawler for websites that you own or are explicitly
authorized to assess. It follows links only within the exact hostnames configured in
\`DISCOVERY_ALLOWED_HOSTS\`, records page titles, same-scope links, in-scope HTML5
media references, and the hostnames of third-party iframe embeds. It does not fetch
third-party embeds or proxy media files.

Run it from the backend directory:

\`\`\`bash
export DISCOVERY_ALLOWED_HOSTS="media.yourdomain.com,cdn.yourdomain.com"
python -m app.services.authorized_crawler \\
  --start-url "https://media.yourdomain.com/" \\
  --max-pages 100 \\
  --max-depth 2
\`\`\`

The crawler requires HTTPS, exact host allowlisting, public DNS resolution, a
maximum depth of five, a maximum of 500 pages, bounded response sizes, timeouts,
and redirect revalidation. It runs sequentially with a delay between requests.
Use only domains covered by your authorization.

The backend exposes the same crawler through an authenticated endpoint:

```bash
curl -X POST "http://localhost:8000/api/discovery/crawl" \
  -H "Authorization: Bearer $DISCOVERY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"start_urls":["https://media.yourdomain.com/"],"max_pages":50,"max_depth":2}'
```

The endpoint requires `DISCOVERY_API_KEY`; it is disabled when the key or
authorized-host allowlist is missing. The API returns a discovery report and
does not automatically add discovered references to the playback catalogue.

Source registration and server-side health checks are separately restricted by
\`STREAM_PROBE_ALLOWED_HOSTS\`. Configure exact hostnames there; unlisted hosts,
IP-literal destinations, local names, non-HTTPS URLs, credentials in URLs, and
redirects outside the allowlist are rejected. A health probe reads at most the first 4 KB using an HTTP range request and checks
for an HLS, DASH, MP4, or WebM signature matching the declared format. This verifies
the media container/manifest type, not the movie's identity, completeness, safety,
licensing, or the operator's rights to distribute it.

These controls are application-layer defenses. Production deployments should
also enforce outbound network egress rules and protect write endpoints with
authentication, authorization, and rate limits. DNS checks alone cannot fully
eliminate DNS-rebinding races.
