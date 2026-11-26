"""FastAPI application entry point."""
import asyncio
import logging
import os
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.services.authorized_crawler import AuthorizedSiteCrawler, ScopeViolation

logger = logging.getLogger(__name__)


class DiscoveryRequest(BaseModel):
    start_urls: list[str] = Field(min_length=1, max_length=10)
    max_pages: int = Field(default=100, ge=1, le=100)
    max_depth: int = Field(default=2, ge=0, le=3)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up...")
    yield
    logger.info("Application shutting down...")


app = FastAPI(
    title="CineStream Aggregator API",
    description="Media catalogue, playback health, and authorized discovery API",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/status")
async def get_status():
    return {
        "status": "running",
        "version": "2.1.0",
        "service": "CineStream Aggregator API",
    }


@app.post("/api/discovery/crawl")
async def crawl_authorized_sites(
    payload: DiscoveryRequest,
    authorization: str | None = Header(default=None),
):
    """Run a bounded crawl against operator-authorized hostnames only."""
    expected_key = os.getenv("DISCOVERY_API_KEY", "")
    if not expected_key:
        raise HTTPException(
            status_code=503,
            detail="Authorized discovery is not configured on this server",
        )

    supplied_key = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not supplied_key or not secrets.compare_digest(supplied_key, expected_key):
        raise HTTPException(status_code=401, detail="Invalid discovery credentials")

    allowed_hosts = [
        host.strip()
        for host in os.getenv("DISCOVERY_ALLOWED_HOSTS", "").split(",")
        if host.strip()
    ]
    if not allowed_hosts:
        raise HTTPException(
            status_code=503,
            detail="DISCOVERY_ALLOWED_HOSTS is not configured",
        )

    try:
        crawler = AuthorizedSiteCrawler(
            allowed_hosts=allowed_hosts,
            max_pages=payload.max_pages,
            max_depth=payload.max_depth,
        )
        report = await asyncio.to_thread(crawler.crawl, payload.start_urls)
        return report.to_dict()
    except (ScopeViolation, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Authorized discovery run failed")
        raise HTTPException(status_code=500, detail="Discovery run failed") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
