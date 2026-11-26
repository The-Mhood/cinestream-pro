# CineStream Pro

CineStream Pro is a Next.js catalogue and multi-source playback application backed by PostgreSQL. It includes account registration, personal watchlists, playback progress, source health verification, and an optional FastAPI service for bounded discovery of websites that the operator owns or is authorized to assess.

The repository does not provide an internet-wide movie-stream harvester. The discovery service follows only explicitly allowlisted hostnames, inventories links and media references, and does not fetch third-party embeds or proxy media payloads.

## Architecture

- **Web application:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Database:** PostgreSQL with Drizzle ORM
- **Playback:** Native browser playback and HLS.js
- **Optional discovery service:** FastAPI + Python 3.12
- **Authentication:** HttpOnly signed session cookie; AUTH_SECRET is required

## Local setup

### Requirements

- Node.js 22 or newer
- PostgreSQL 16 or compatible
- Python 3.12 only if you intend to run the discovery service

### 1. Configure the environment

    cp .env.example .env
    openssl rand -hex 32

Put the generated 64-character secret in AUTH_SECRET. Set DATABASE_URL to your PostgreSQL database. Do not commit .env or paste its secrets into issues or chat.

### 2. Install and initialize

    npm install
    npm run db:init
    npm run dev

Open http://localhost:3000.

The database initializer creates the application tables. On first application access, the app seeds a small sample catalogue. Sample source records begin as **pending** and do not count as healthy until a server-side verification succeeds.

### 3. Optional FastAPI discovery service

    cd backend
    python3.12 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    export PYTHONPATH=.
    uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

For local use, set BACKEND_API_URL=http://127.0.0.1:8000 in the Next.js environment. Set the same DISCOVERY_API_KEY in the web and backend environments, and configure DISCOVERY_ALLOWED_HOSTS with exact hostnames you are authorized to crawl. Set CORS_ALLOWED_ORIGINS to the exact web origin.

The crawler has bounded page/depth limits, HTTPS-only requests, exact hostname scope, DNS checks, redirect revalidation, response-size limits, timeouts, and sequential request pacing. It records third-party iframe hostnames but does not fetch those hosts.

## Production deployment

Deploy the Next.js application to a host that supports Next.js 16 and Node.js 22+, and use a managed PostgreSQL database. The FastAPI discovery service is optional; the main catalogue, accounts, watchlists, and playback UI do not require it.

### Required web environment

| Variable | Purpose |
|---|---|
| DATABASE_URL | PostgreSQL connection string |
| AUTH_SECRET | At least 32 random bytes; generate with openssl rand -hex 32 |
| STREAM_PROBE_ALLOWED_HOSTS | Comma-separated exact HTTPS hostnames permitted for server-side source checks |

### Optional discovery environment

| Variable | Purpose |
|---|---|
| BACKEND_API_URL | Private/internal URL of the FastAPI service |
| DISCOVERY_API_KEY | Shared secret between Next.js and FastAPI |
| DISCOVERY_ALLOWED_HOSTS | Exact hostnames authorized for recursive discovery |
| DISCOVERY_ADMIN_EMAILS | Comma-separated admin email allowlist |
| CORS_ALLOWED_ORIGINS | Exact web origin(s) allowed by FastAPI |
| NEXT_PUBLIC_API_URL | Optional backend URL for integrations that need a browser-visible URL |

### Launch sequence

1. Provision PostgreSQL and set DATABASE_URL.
2. Configure a unique AUTH_SECRET; never use a shared or example secret.
3. Deploy the Next.js application.
4. Run npm run db:init once against the production database from a trusted environment.
5. Open /api/health; it should return HTTP 200 with both database and auth-secret checks passing.
6. Register your own account. Promote it to administrator using a trusted database console:

       UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';

7. If authorized discovery is required, deploy the FastAPI service privately, configure its shared key and host allowlist, add the same administrator email to DISCOVERY_ADMIN_EMAILS, and set the exact frontend origin in CORS_ALLOWED_ORIGINS.
8. Add only source hostnames you are authorized to use to STREAM_PROBE_ALLOWED_HOSTS. Administrators can use **Verify Source** on the watch page to run a bounded server-side content-signature check.

Demo accounts are disabled by default in production. Keep ENABLE_DEMO_ACCOUNT=false and NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false for a public deployment. Do not enable the public demo credentials on a production site unless you deliberately accept the access they provide.

## Verification

Run these before deployment:

    npm run typecheck
    npm run build
    PYTHONPATH=backend python -m unittest discover -s backend/tests -v

The GitHub Actions workflow runs the TypeScript check, production build, and Python crawler tests on pull requests and pushes to the configured branches.

## Security model and operational limits

- Source registration and server-side media probes require an authenticated administrator.
- Discovery requires an authenticated administrator whose email is also explicitly allowlisted.
- Sign-in, registration, source registration, health probes, and discovery have application-level rate limits. The in-memory limiter is per process; configure distributed rate limits at your hosting edge/WAF for production.
- Outbound media probes require HTTPS, an exact hostname allowlist, public DNS resolution, redirect revalidation, a short timeout, and a bounded byte read.
- DNS validation followed by a separate HTTP connection still has a DNS-rebinding race. Production must enforce outbound network egress rules so application traffic cannot reach loopback, private, link-local, metadata, or other non-public networks.
- A media signature check identifies a container or manifest type. It does not prove the media's identity, completeness, safety, licensing, or distribution rights.
- Browser playback success is not treated as server-side source verification.
- The optional crawler inventories media references; it does not download media, crawl third-party embeds, or automatically add results to the playback catalogue.

## Useful endpoints

- GET /api/health — web application readiness (database and auth-secret configuration)
- GET /api/movies — catalogue
- GET /api/movies/{id} — title and configured sources
- GET /api/aggregator — provider and source telemetry
- GET /health — FastAPI liveness
- GET /docs — FastAPI interactive API documentation (when the optional backend is running)

## Docker

The repository also includes Docker-oriented files for operators who prefer containerized infrastructure. Docker is not required for local development or for the Next.js deployment described above.
