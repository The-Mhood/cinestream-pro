import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, streamSources } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { validateOutboundUrl } from "@/lib/server/safe-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FeedSource = {
  url: string;
  quality?: string;
  format?: string;
  language?: string;
  season?: number;
  episode?: number;
  label?: string;
};

type FeedEpisode = {
  episode: number;
  title?: string;
  sources: FeedSource[];
};

type FeedSeason = {
  season: number;
  episodes: FeedEpisode[];
};

type FeedItem = {
  externalId: string;
  tmdbId?: number;
  title: string;
  type: "movie" | "series";
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseYear?: number;
  durationMinutes?: number;
  rating?: number;
  genres?: string[];
  cast?: string[];
  seasons?: FeedSeason[];
  sources?: FeedSource[];
};

type ProviderFeed = {
  version: 1;
  provider: string;
  items: FeedItem[];
};

const FEEDS = [
  { name: "Cinejoy", env: "CINEJOY_CATALOG_FEED_URL", slug: "cinejoy" },
  { name: "Cinelite", env: "CINELITE_CATALOG_FEED_URL", slug: "cinelite" },
  { name: "Vivarium", env: "VIVARIUM_CATALOG_FEED_URL", slug: "vivarium" },
  { name: "Movy", env: "MOVY_CATALOG_FEED_URL", slug: "movy" },
] as const;

function allowedHosts(name: string): Set<string> {
  return new Set((process.env[name] ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
}

function validateFeedUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Feed URLs must use HTTPS on the standard port without embedded credentials.");
  }
  if (!allowedHosts("DISCOVERY_ALLOWED_HOSTS").has(url.hostname.toLowerCase())) {
    throw new Error(`Feed host is not in DISCOVERY_ALLOWED_HOSTS: ${url.hostname}`);
  }
  return url;
}

function safeImage(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function validItem(item: FeedItem): boolean {
  return Boolean(
    item && typeof item.externalId === "string" && item.externalId.trim() &&
    typeof item.title === "string" && item.title.trim() &&
    (item.type === "movie" || item.type === "series")
  );
}

function flattenSources(item: FeedItem): Array<FeedSource & { season: number; episode: number }> {
  const direct = (item.sources ?? []).map((source) => ({
    ...source,
    season: source.season ?? 1,
    episode: source.episode ?? 1,
  }));
  const episodes = (item.seasons ?? []).flatMap((season) =>
    season.episodes.flatMap((episode) =>
      episode.sources.map((source) => ({
        ...source,
        season: season.season,
        episode: episode.episode,
      }))
    )
  );
  return [...direct, ...episodes];
}

function validateSource(source: FeedSource): URL {
  const url = new URL(source.url);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Playback sources must use HTTPS on the standard port without credentials.");
  }
  if (!allowedHosts("STREAM_PROBE_ALLOWED_HOSTS").has(url.hostname.toLowerCase())) {
    throw new Error(`Playback host is not in STREAM_PROBE_ALLOWED_HOSTS: ${url.hostname}`);
  }
  // Reuse the same outbound URL policy used by the admin health verifier.
  validateOutboundUrl(url.toString());
  return url;
}

async function readFeed(name: string, env: string, slug: string) {
  const rawUrl = process.env[env];
  if (!rawUrl) return { configured: false as const, provider: name, slug };
  const url = validateFeedUrl(rawUrl);
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${name} feed returned HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 10_000_000) throw new Error(`${name} feed exceeds the 10 MB limit`);
  const body = await response.text();
  if (body.length > 10_000_000) throw new Error(`${name} feed exceeds the 10 MB limit`);
  const feed = JSON.parse(body) as ProviderFeed;
  if (feed.version !== 1 || !Array.isArray(feed.items) || feed.items.length > 5000) {
    throw new Error(`${name} feed does not match CineStream feed contract v1 or exceeds 5,000 items`);
  }
  return { configured: true as const, provider: name, slug, feed };
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const admins = new Set((process.env.DISCOVERY_ADMIN_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (user.role !== "admin" || !admins.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Authorized discovery administrator access required" }, { status: 403 });
  }

  const rate = checkRateLimit(`first-party-sync:${user.id}`, 1, 5 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Sync rate limit reached. Try again shortly." }, {
      status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  try {
    const feeds = await Promise.all(FEEDS.map((feed) => readFeed(feed.name, feed.env, feed.slug)));
    const configured = feeds.filter((feed) => feed.configured);
    const missing = feeds.filter((feed) => !feed.configured).map((feed) => feed.provider);
    if (configured.length === 0) {
      return NextResponse.json({
        error: "No first-party catalogue feeds are configured.",
        missing,
      }, { status: 503 });
    }

    const totals = { providers: configured.length, titlesCreated: 0, titlesUpdated: 0, sourcesAdded: 0, sourcesSkipped: 0 };
    const errors: string[] = [];

    for (const entry of configured) {
      if (!entry.configured) continue;
      const providerName = entry.feed.provider?.trim() || entry.provider;
      for (const item of entry.feed.items) {
        if (!validItem(item)) {
          errors.push(`${providerName}: skipped an invalid catalogue item`);
          continue;
        }

        const slug = `${entry.slug}-${item.type}-${item.externalId}`
          .toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").slice(0, 180);
        const seasons = item.seasons ?? [];
        const episodeCount = seasons.reduce((count, season) => count + season.episodes.length, 0);
        const values = {
          slug,
          title: item.title.trim().slice(0, 300),
          type: item.type,
          posterPath: safeImage(item.posterUrl, "https://placehold.co/500x750?text=No+Poster"),
          backdropPath: safeImage(item.backdropUrl, safeImage(item.posterUrl, "https://placehold.co/500x750?text=No+Poster")),
          overview: (item.overview ?? "").trim().slice(0, 5000) || "No synopsis available.",
          releaseYear: Number.isInteger(item.releaseYear) ? item.releaseYear! : 0,
          durationMinutes: Number.isInteger(item.durationMinutes) ? item.durationMinutes! : 0,
          rating: Number.isFinite(item.rating) ? Math.max(0, Math.min(10, Number(item.rating))) : 0,
          genres: (item.genres ?? []).slice(0, 20).join(", ") || "Unclassified",
          castList: (item.cast ?? []).slice(0, 30).join(", ") || "Cast details unavailable",
          seasonsCount: item.type === "series" ? Math.max(1, seasons.length) : 1,
          episodesCount: item.type === "series" ? episodeCount : 1,
          tmdbId: Number.isSafeInteger(item.tmdbId) && item.tmdbId! > 0 ? item.tmdbId! : null,
          isTrending: false,
          discoveredVia: `First-party feed: ${providerName}`,
        };

        let mediaId: number | undefined;
        if (values.tmdbId) {
          const [existing] = await db.select({ id: mediaItems.id }).from(mediaItems)
            .where(and(eq(mediaItems.tmdbId, values.tmdbId), eq(mediaItems.type, item.type))).limit(1);
          mediaId = existing?.id;
        }
        if (!mediaId) {
          const [existing] = await db.select({ id: mediaItems.id }).from(mediaItems)
            .where(eq(mediaItems.slug, slug)).limit(1);
          mediaId = existing?.id;
        }

        if (mediaId) {
          // Preserve the first stable application slug when multiple providers
          // report the same TMDB title.
          const { slug: _stableSlug, ...updateValues } = values;
          await db.update(mediaItems).set(updateValues).where(eq(mediaItems.id, mediaId));
          totals.titlesUpdated += 1;
        } else {
          const [created] = await db.insert(mediaItems).values(values).returning({ id: mediaItems.id });
          mediaId = created?.id;
          if (!mediaId) throw new Error(`Could not create catalogue record for ${item.title}`);
          totals.titlesCreated += 1;
        }
        if (!mediaId) throw new Error(`Could not resolve catalogue record for ${item.title}`);

        for (const source of flattenSources(item)) {
          try {
            validateSource(source);
            if (!Number.isInteger(source.season) || source.season < 1 ||
                !Number.isInteger(source.episode) || source.episode < 1) {
              throw new Error("Invalid season or episode number");
            }
            const [duplicate] = await db.select({ id: streamSources.id }).from(streamSources)
              .where(and(
                eq(streamSources.mediaId, mediaId),
                eq(streamSources.url, source.url),
                eq(streamSources.season, source.season),
                eq(streamSources.episode, source.episode)
              )).limit(1);
            if (duplicate) {
              totals.sourcesSkipped += 1;
              continue;
            }
            await db.insert(streamSources).values({
              mediaId,
              providerName,
              serverLabel: source.label?.trim().slice(0, 120) || `${providerName} · ${source.quality || "Auto"}`,
              url: source.url,
              quality: source.quality || "Auto",
              format: source.format || "HLS",
              language: source.language || "Unknown",
              season: source.season,
              episode: source.episode,
              status: "pending",
              isActive: false,
            });
            totals.sourcesAdded += 1;
          } catch (error) {
            totals.sourcesSkipped += 1;
            errors.push(`${item.title}: source skipped (${error instanceof Error ? error.message : "invalid source"})`);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, ...totals, missingProviders: missing, errors: errors.slice(0, 50),
      note: "Imported sources remain pending and cannot play until an administrator verifies them through the server-side media probe." });
  } catch (error) {
    console.error("First-party catalogue sync failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: error instanceof Error ? error.message : "First-party catalogue sync failed" }, { status: 502 });
  }
}
