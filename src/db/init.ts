import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

async function initializeDatabase() {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  try {
    const db = drizzle(pool, { schema });

    console.log("Creating database schema...");

    // Create tables using raw SQL to ensure they're created in production
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS media_items (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'movie',
        poster_path TEXT NOT NULL,
        backdrop_path TEXT NOT NULL,
        overview TEXT NOT NULL,
        release_year INTEGER NOT NULL DEFAULT 2024,
        duration_minutes INTEGER NOT NULL DEFAULT 112,
        rating DOUBLE PRECISION NOT NULL DEFAULT 8.4,
        genres TEXT NOT NULL DEFAULT 'Sci-Fi, Action',
        cast_list TEXT NOT NULL DEFAULT 'Elena Vance, Marcus Thorne',
        seasons_count INTEGER NOT NULL DEFAULT 1,
        episodes_count INTEGER NOT NULL DEFAULT 1,
        tmdb_id INTEGER,
        is_trending BOOLEAN NOT NULL DEFAULT FALSE,
        discovered_via TEXT NOT NULL DEFAULT 'CineStream Index',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS providers (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        avg_latency_ms INTEGER NOT NULL DEFAULT 45,
        uptime_percent DOUBLE PRECISION NOT NULL DEFAULT 99.2,
        total_streams_indexed INTEGER NOT NULL DEFAULT 0,
        last_checked_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stream_sources (
        id SERIAL PRIMARY KEY,
        media_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
        provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
        provider_name TEXT NOT NULL,
        server_label TEXT NOT NULL,
        url TEXT NOT NULL,
        quality TEXT NOT NULL DEFAULT '1080p',
        format TEXT NOT NULL DEFAULT 'HLS',
        language TEXT NOT NULL DEFAULT 'English',
        season INTEGER NOT NULL DEFAULT 1,
        episode INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'active',
        latency_ms INTEGER NOT NULL DEFAULT 38,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        success_count INTEGER NOT NULL DEFAULT 12,
        fail_count INTEGER NOT NULL DEFAULT 0,
        last_checked_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS watchlist_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
        in_watchlist BOOLEAN NOT NULL DEFAULT TRUE,
        progress_seconds INTEGER NOT NULL DEFAULT 0,
        last_server_id INTEGER,
        last_watched_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS watchlist_user_media_idx ON watchlist_items(user_id, media_id);

      CREATE TABLE IF NOT EXISTS aggregation_runs (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        providers_scanned INTEGER NOT NULL DEFAULT 5,
        titles_discovered INTEGER NOT NULL DEFAULT 0,
        sources_verified INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        summary TEXT NOT NULL
      );
    `);

    console.log("✓ Database schema created successfully");
  } catch (error) {
    console.error("✗ Failed to initialize database:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

initializeDatabase().catch((error) => {
  console.error("Database initialization failed:", error);
  process.exit(1);
});
