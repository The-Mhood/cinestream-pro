import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TmdbListItem = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
};

type TmdbList = { results?: TmdbListItem[]; total_pages?: number };

const TMDB_IMAGE = "https://image.tmdb.org/t/p";
const PAGE_SIZE = 20;

async function tmdb<T>(path: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`TMDB request failed (${response.status}) for ${path}`);
  return response.json() as Promise<T>;
}

function yearOf(item: TmdbListItem, type: "movie" | "series"): number {
  const raw = type === "movie" ? item.release_date : item.first_air_date;
  const year = raw ? Number(raw.slice(0, 4)) : 0;
  return Number.isInteger(year) && year >= 1888 && year <= 2200 ? year : 0;
}

function slugFor(type: "movie" | "series", id: number): string {
  return `tmdb-${type}-${id}`;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const adminEmails = new Set((process.env.DISCOVERY_ADMIN_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (user.role !== "admin" || !adminEmails.has(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Authorized discovery administrator access required" }, { status: 403 });
  }

  const rate = checkRateLimit(`catalog-import:${user.id}`, 3, 10 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Import limit reached. Try again shortly." }, {
      status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY is not configured on the server." }, { status: 503 });
  }

  let pages = 5;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.pages !== undefined) pages = Number(body.pages);
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!Number.isInteger(pages) || pages < 1 || pages > 10) {
    return NextResponse.json({ error: "pages must be an integer from 1 to 10." }, { status: 400 });
  }

  try {
    const [movieGenres, tvGenres, ...feeds] = await Promise.all([
      tmdb<{ genres?: { id: number; name: string }[] }>("/genre/movie/list", apiKey),
      tmdb<{ genres?: { id: number; name: string }[] }>("/genre/tv/list", apiKey),
      ...Array.from({ length: pages }, (_, i) => tmdb<TmdbList>("/discover/movie", apiKey, {
        page: String(i + 1), include_adult: "false", watch_region: "US", sort_by: "popularity.desc",
      })),
      ...Array.from({ length: pages }, (_, i) => tmdb<TmdbList>("/discover/tv", apiKey, {
        page: String(i + 1), include_adult: "false", watch_region: "US", sort_by: "popularity.desc",
      })),
      tmdb<TmdbList>("/trending/movie/day", apiKey),
      tmdb<TmdbList>("/trending/tv/day", apiKey),
      tmdb<TmdbList>("/tv/on_the_air", apiKey, { page: "1" }),
    ]);

    const movieGenreMap = new Map((movieGenres.genres ?? []).map((g) => [g.id, g.name]));
    const tvGenreMap = new Map((tvGenres.genres ?? []).map((g) => [g.id, g.name]));
    const movieFeed = feeds.slice(0, pages);
    const tvFeed = feeds.slice(pages, pages * 2);
    const trendingMovies = feeds[pages * 2];
    const trendingTv = feeds[pages * 2 + 1];
    const onTheAir = feeds[pages * 2 + 2];

    const records = new Map<string, { item: TmdbListItem; type: "movie" | "series"; trending: boolean }>();
    const add = (list: TmdbList | undefined, type: "movie" | "series", trending: boolean) => {
      for (const item of list?.results ?? []) {
        if (!Number.isSafeInteger(item.id) || item.id < 1) continue;
        const key = `${type}:${item.id}`;
        const previous = records.get(key);
        records.set(key, { item, type, trending: trending || Boolean(previous?.trending) });
      }
    };
    movieFeed.forEach((feed) => add(feed, "movie", false));
    tvFeed.forEach((feed) => add(feed, "series", false));
    add(trendingMovies, "movie", true);
    add(trendingTv, "series", true);
    add(onTheAir, "series", true);

    let inserted = 0;
    let updated = 0;
    for (const { item, type, trending } of records.values()) {
      const title = (type === "movie" ? item.title : item.name)?.trim();
      if (!title) continue;
      const genreMap = type === "movie" ? movieGenreMap : tvGenreMap;
      const genres = (item.genre_ids ?? []).map((id) => genreMap.get(id)).filter(Boolean).join(", ") || "Unclassified";
      const posterPath = item.poster_path ? `${TMDB_IMAGE}/w500${item.poster_path}` : "https://placehold.co/500x750?text=No+Poster";
      const backdropPath = item.backdrop_path ? `${TMDB_IMAGE}/w1280${item.backdrop_path}` : posterPath;
      const values = {
        slug: slugFor(type, item.id),
        title,
        type,
        posterPath,
        backdropPath,
        overview: item.overview?.trim() || "No synopsis is available yet.",
        releaseYear: yearOf(item, type),
        durationMinutes: 0,
        rating: Number.isFinite(item.vote_average) ? Number(item.vote_average) : 0,
        genres,
        castList: "Cast details not imported",
        seasonsCount: 1,
        episodesCount: 1,
        tmdbId: item.id,
        isTrending: trending,
        discoveredVia: "Cinejoy catalogue feed (TMDB)",
      };

      const [existing] = await db.select({ id: mediaItems.id })
        .from(mediaItems)
        .where(and(eq(mediaItems.tmdbId, item.id), eq(mediaItems.type, type)))
        .limit(1);
      if (existing) {
        await db.update(mediaItems).set(values).where(eq(mediaItems.id, existing.id));
        updated += 1;
      } else {
        await db.insert(mediaItems).values(values).onConflictDoNothing();
        inserted += 1;
      }
    }

    // Remove only the known synthetic demo catalogue after a successful real import.
    await db.delete(mediaItems).where(eq(mediaItems.discoveredVia, "Sample catalogue"));

    const [total] = await db.select({ count: mediaItems.id }).from(mediaItems).orderBy(desc(mediaItems.id)).limit(1);
    return NextResponse.json({
      ok: true,
      source: "Cinejoy's observed TMDB catalogue feeds",
      pagesPerType: pages,
      imported: inserted,
      refreshed: updated,
      uniqueFeedRecords: records.size,
      note: "These are catalogue titles surfaced by Cinejoy's metadata feeds. A title is not marked playable; stream sources require separate verification.",
    });
  } catch (error) {
    console.error("Catalogue import failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Catalogue import failed. Check the server logs and TMDB_API_KEY." }, { status: 502 });
  }
}
