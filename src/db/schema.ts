import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mediaItems = pgTable("media_items", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").notNull().default("movie"), // 'movie' | 'series'
  posterPath: text("poster_path").notNull(),
  backdropPath: text("backdrop_path").notNull(),
  overview: text("overview").notNull(),
  releaseYear: integer("release_year").notNull().default(2024),
  durationMinutes: integer("duration_minutes").notNull().default(112),
  rating: doublePrecision("rating").notNull().default(8.4),
  genres: text("genres").notNull().default("Sci-Fi, Action"),
  castList: text("cast_list").notNull().default("Elena Vance, Marcus Thorne"),
  seasonsCount: integer("seasons_count").notNull().default(1),
  episodesCount: integer("episodes_count").notNull().default(1),
  tmdbId: integer("tmdb_id"),
  isTrending: boolean("is_trending").notNull().default(false),
  discoveredVia: text("discovered_via").notNull().default("CineStream Index"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'degraded' | 'offline'
  avgLatencyMs: integer("avg_latency_ms").notNull().default(45),
  uptimePercent: doublePrecision("uptime_percent").notNull().default(99.2),
  totalStreamsIndexed: integer("total_streams_indexed").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
});

export const streamSources = pgTable("stream_sources", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id")
    .notNull()
    .references(() => mediaItems.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").references(() => providers.id, {
    onDelete: "set null",
  }),
  providerName: text("provider_name").notNull(),
  serverLabel: text("server_label").notNull(),
  url: text("url").notNull(),
  quality: text("quality").notNull().default("1080p"),
  format: text("format").notNull().default("HLS"),
  language: text("language").notNull().default("English"),
  season: integer("season").notNull().default(1),
  episode: integer("episode").notNull().default(1),
  status: text("status").notNull().default("active"), // 'active' | 'degraded' | 'offline'
  latencyMs: integer("latency_ms").notNull().default(38),
  isActive: boolean("is_active").notNull().default(true),
  successCount: integer("success_count").notNull().default(12),
  failCount: integer("fail_count").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at").defaultNow().notNull(),
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaId: integer("media_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    inWatchlist: boolean("in_watchlist").notNull().default(true),
    progressSeconds: integer("progress_seconds").notNull().default(0),
    lastServerId: integer("last_server_id"),
    lastWatchedAt: timestamp("last_watched_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("watchlist_user_media_idx").on(table.userId, table.mediaId),
  ]
);

export const aggregationRuns = pgTable("aggregation_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
  providersScanned: integer("providers_scanned").notNull().default(5),
  titlesDiscovered: integer("titles_discovered").notNull().default(0),
  sourcesVerified: integer("sources_verified").notNull().default(0),
  status: text("status").notNull().default("completed"),
  summary: text("summary").notNull(),
});

export type User = typeof users.$inferSelect;
export type MediaItem = typeof mediaItems.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type StreamSource = typeof streamSources.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type AggregationRun = typeof aggregationRuns.$inferSelect;
