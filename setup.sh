#!/bin/bash
# CineStream Aggregator - Complete Setup & Operations Guide

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       CineStream Aggregator - Setup & Operations           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to print section headers
print_section() {
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}→ $1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to run command with feedback
run_command() {
    echo -e "${YELLOW}$ $@${NC}"
    "$@" || { echo -e "${RED}✗ Command failed${NC}"; exit 1; }
    echo -e "${GREEN}✓ Success${NC}\n"
}

# Step 1: Environment Setup
print_section "STEP 1: Environment Setup"

if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env << 'EOF'
# Database
POSTGRES_USER=user
POSTGRES_PASSWORD=pass
POSTGRES_DB=aggregator
DATABASE_URL=postgresql://user:pass@db:5432/aggregator

# Redis
REDIS_URL=redis://redis:6379

# APIs
TMDB_API_KEY=your_tmdb_api_key_here

# Services
LOG_LEVEL=info
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost:8000
EOF
    echo -e "${GREEN}✓ .env created (edit TMDB_API_KEY before proceeding)${NC}"
else
    echo -e "${GREEN}✓ .env already exists${NC}"
fi
echo ""

# Step 2: Start Services
print_section "STEP 2: Starting All Services"

echo -e "${YELLOW}Starting Docker containers...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
echo -e "${YELLOW}Checking service status:${NC}"
docker-compose ps
echo ""

# Step 3: Verify Connections
print_section "STEP 3: Verifying Connections"

echo -e "${YELLOW}Testing PostgreSQL connection...${NC}"
docker-compose exec -T db psql -U user -d aggregator -c "SELECT version();" > /dev/null && \
    echo -e "${GREEN}✓ PostgreSQL connected${NC}" || \
    { echo -e "${RED}✗ PostgreSQL connection failed${NC}"; exit 1; }

echo -e "${YELLOW}Testing Redis connection...${NC}"
docker-compose exec -T redis redis-cli ping > /dev/null && \
    echo -e "${GREEN}✓ Redis connected${NC}" || \
    { echo -e "${RED}✗ Redis connection failed${NC}"; exit 1; }

echo -e "${YELLOW}Testing Backend API...${NC}"
curl -s http://localhost:8000/health | grep -q "healthy" && \
    echo -e "${GREEN}✓ Backend API healthy${NC}" || \
    { echo -e "${RED}✗ Backend API not responding${NC}"; exit 1; }
echo ""

# Step 4: Initialize Database
print_section "STEP 4: Initializing Database"

echo -e "${YELLOW}Creating database tables...${NC}"
docker-compose exec -T backend python -c "from app.database import init_db; init_db()" && \
    echo -e "${GREEN}✓ Database initialized${NC}" || \
    echo -e "${YELLOW}! Tables may already exist${NC}"
echo ""

# Step 5: Seed Initial Data
print_section "STEP 5: Seeding Initial Data"

echo -e "${YELLOW}Running one-time aggregation seed...${NC}"
docker-compose exec -T scraper python -m app.services.scrapers_cli --once && \
    echo -e "${GREEN}✓ Initial data seeded${NC}" || \
    echo -e "${YELLOW}! Seeding completed with warnings${NC}"
echo ""

# Step 6: Verify Data
print_section "STEP 6: Verifying Data Population"

echo -e "${YELLOW}Checking movie count...${NC}"
MOVIE_COUNT=$(docker-compose exec -T db psql -U user -d aggregator -c "SELECT COUNT(*) FROM movies;" 2>/dev/null | tail -1 | xargs)
echo -e "${GREEN}✓ Movies in database: $MOVIE_COUNT${NC}"

echo -e "${YELLOW}Checking stream sources...${NC}"
SOURCE_COUNT=$(docker-compose exec -T db psql -U user -d aggregator -c "SELECT COUNT(*) FROM stream_sources;" 2>/dev/null | tail -1 | xargs)
echo -e "${GREEN}✓ Stream sources: $SOURCE_COUNT${NC}"

echo -e "${YELLOW}Checking providers...${NC}"
PROVIDER_COUNT=$(docker-compose exec -T db psql -U user -d aggregator -c "SELECT COUNT(*) FROM providers;" 2>/dev/null | tail -1 | xargs)
echo -e "${GREEN}✓ Providers: $PROVIDER_COUNT${NC}"
echo ""

# Step 7: Status Summary
print_section "STEP 7: Setup Complete!"

echo -e "${GREEN}✓ All services running${NC}"
echo ""
echo -e "${BLUE}Service URLs:${NC}"
echo -e "  Frontend:  ${GREEN}http://localhost:3000${NC}"
echo -e "  Backend:   ${GREEN}http://localhost:8000${NC}"
echo -e "  API Docs:  ${GREEN}http://localhost:8000/docs${NC}"
echo -e "  Database:  ${GREEN}postgresql://localhost:5432/aggregator${NC}"
echo -e "  Redis:     ${GREEN}redis://localhost:6379${NC}"
echo ""

echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. View logs:          ${YELLOW}docker-compose logs -f backend${NC}"
echo -e "  2. Run scraper:        ${YELLOW}docker-compose logs -f scraper${NC}"
echo -e "  3. Database shell:     ${YELLOW}docker-compose exec db psql -U user -d aggregator${NC}"
echo -e "  4. Stop all:           ${YELLOW}docker-compose down${NC}"
echo ""

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Setup Complete! ✓                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
