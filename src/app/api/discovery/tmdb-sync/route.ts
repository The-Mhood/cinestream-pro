import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TmdbItem = {
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
  media_type?: "movie" | "tv";
};

type TmdbResponse = { results?: TmdbItem[] };

const GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics",
};

function image(path: string | null | undefined, size: "w500" | "w1280"): string {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : "https://placehold.co/500x750?text=No+Poster";
}

async function fetchTmdb(path: string, key: string): Promise<TmdbItem[]> {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`TMDB returned HTTP ${response.status} for ${path}`);
  const data = await response.json() as TmdbResponse;
  return Array.isArray(data.results) ? data.results : [];
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  const rate = checkRateLimit(`tmdb-catalogue-sync:${user.id}`, 1, 5 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Catalogue sync rate limit reached. Try again shortly." }, {
      status: 429,
      headers: { "Retry-After": String(rate.retryAfterSeconds) },
    });
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TMDB_API_KEY is not configured on the server." }, { status: 503 });
  }

  try {
    const [trending, movies, series] = await Promise.all([
      fetchTmdb("trending/all/week", key),
      fetchTmdb("movie/popular", key),
      fetchTmdb("tv/popular", key),
    ]);

    const unique = new Map<string, TmdbItem>();
    for (const item of [...trending, ...movies, ...series]) {
      const type = item.media_type ?? (item.name ? "tv" : "movie");
      if ((type === "movie" || type === "tv") && Number.isSafeInteger(item.id) && item.id > 0) {
        unique.set(`${type}:${item.id}`, { ...item, media_type: type });
      }
    }

    let created = 0;
    let updated = 0;

    for (const item of unique.values()) {
      const type = item.media_type === "tv" ? "series" : "movie";
      const title = (item.title ?? item.name ?? "").trim();
      if (!title) continue;
      const date = item.release_date ?? item.first_air_date ?? "";
      const releaseYear = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : 0;
      const genres = [...new Set((item.genre_ids ?? []).map((id) => GENRES[id]).filter(Boolean))].join(", ") || "Unclassified";
      const slug = `tmdb-${type}-${item.id}`;
      const values = {
        slug,
        title: title.slice(0, 300),
        type,
        posterPath: image(item.poster_path, "w500"),
        backdropPath: item.backdrop_path ? image(item.backdrop_path, "w1280") : image(item.poster_path, "w500"),
        overview: (item.overview ?? "").trim().slice(0, 5000) || "No synopsis available.",
        releaseYear,
        durationMinutes: 0,
        rating: Number.isFinite(item.vote_average) ? Math.max(0, Math.min(10, Number(item.vote_average))) : 0,
        genres,
        castList: "Cast details unavailable",
        seasonsCount: 1,
        episodesCount: 1,
        tmdbId: item.id,
        isTrending: trending.some((candidate) => candidate.id === item.id),
        discoveredVia: "TMDB catalogue metadata",
      };

      const [existing] = await db.select({ id: mediaItems.id })
        .from(mediaItems)
        .where(and(eq(mediaItems.tmdbId, item.id), eq(mediaItems.type, type)))
        .limit(1);

      if (existing) {
        await db.update(mediaItems).set(values).where(eq(mediaItems.id, existing.id));
        updated += 1;
      } else {
        await db.insert(mediaItems).values(values);
        created += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      fetched: unique.size,
      created,
      updated,
      note: "Movie and series metadata is now in the CineStream catalogue. TMDB does not provide playable video streams; playback sources must be connected and verified separately.",
    });
  } catch (error) {
    console.error("TMDB catalogue sync failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: error instanceof Error ? error.message : "TMDB catalogue sync failed" }, { status: 502 });
  }
}
