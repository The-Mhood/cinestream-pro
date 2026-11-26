import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaItems, streamSources } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { desc, eq } from "drizzle-orm";
import { validateOutboundUrl } from "@/lib/server/safe-url";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // 'movie' | 'series'
    const q = searchParams.get("q")?.trim().toLowerCase() ?? "";
    const genre = searchParams.get("genre")?.trim().toLowerCase() ?? "";
    const trending = searchParams.get("trending");

    const allMedia = await db
      .select()
      .from(mediaItems)
      .orderBy(desc(mediaItems.isTrending), desc(mediaItems.rating));

    const allSources = await db.select().from(streamSources);

    const sourcesByMedia = new Map<
      number,
      { total: number; active: number; maxQuality: string }
    >();

    for (const src of allSources) {
      const entry = sourcesByMedia.get(src.mediaId) ?? {
        total: 0,
        active: 0,
        maxQuality: "Unverified",
      };
      entry.total += 1;
      if (src.status === "active" && src.isActive) {
        entry.active += 1;
      }
      if (src.status === "active" && src.isActive) {
        if (src.quality === "4K") {
          entry.maxQuality = "4K";
        } else if (src.quality === "1080p" && entry.maxQuality !== "4K") {
          entry.maxQuality = "1080p";
        } else if (src.quality === "720p" && entry.maxQuality === "Unverified") {
          entry.maxQuality = "720p";
        }
      }
      sourcesByMedia.set(src.mediaId, entry);
    }

    const filtered = allMedia
      .filter((item) => {
        if (type && type !== "all" && item.type !== type) return false;
        if (trending === "true" && !item.isTrending) return false;
        if (
          genre &&
          genre !== "all" &&
          !item.genres.toLowerCase().includes(genre)
        ) {
          return false;
        }
        if (q) {
          const haystack =
            `${item.title} ${item.overview} ${item.genres} ${item.castList}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .map((item) => {
        const stats = sourcesByMedia.get(item.id) ?? {
          total: 0,
          active: 0,
          maxQuality: "1080p",
        };
        return {
          ...item,
          sourceCount: stats.total,
          activeSourceCount: stats.active,
          maxQuality: stats.maxQuality,
        };
      });

    return NextResponse.json({
      items: filtered,
      total: filtered.length,
    });
  } catch (err) {
    console.error("GET /api/movies error:", err);
    return NextResponse.json(
      { error: "Failed to load catalog" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }

  const rate = checkRateLimit(`source-create:${user.id}`, 10, 60 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Source registration limit reached. Try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const body = await request.json();
    const mediaId = Number(body.mediaId);
    const providerName = typeof body.providerName === "string" ? body.providerName.trim() : "";
    const serverLabel = typeof body.serverLabel === "string" ? body.serverLabel.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const quality = typeof body.quality === "string" ? body.quality : "1080p";
    const format = typeof body.format === "string" ? body.format.toUpperCase() : "HLS";
    const season = Number(body.season ?? 1);
    const episode = Number(body.episode ?? 1);

    if (
      !Number.isSafeInteger(mediaId) || mediaId < 1 ||
      !providerName || providerName.length > 80 ||
      !url || url.length > 2048
    ) {
      return NextResponse.json(
        { error: "A valid mediaId, providerName (max 80 chars), and URL are required" },
        { status: 400 }
      );
    }

    if (!["360p", "480p", "720p", "1080p", "4K"].includes(quality)) {
      return NextResponse.json({ error: "Unsupported quality value" }, { status: 400 });
    }
    if (!["HLS", "DASH", "MP4", "WEBM"].includes(format)) {
      return NextResponse.json({ error: "Unsupported media format" }, { status: 400 });
    }
    if (
      !Number.isSafeInteger(season) || season < 1 || season > 100 ||
      !Number.isSafeInteger(episode) || episode < 1 || episode > 1000
    ) {
      return NextResponse.json({ error: "Invalid season or episode number" }, { status: 400 });
    }

    let approvedUrl: URL;
    try {
      approvedUrl = validateOutboundUrl(url);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Source URL is not permitted" },
        { status: 400 }
      );
    }

    const [media] = await db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, mediaId))
      .limit(1);

    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    const [created] = await db
      .insert(streamSources)
      .values({
        mediaId: media.id,
        providerName,
        serverLabel: (serverLabel || `${providerName} Custom`).slice(0, 120),
        url: approvedUrl.toString(),
        quality,
        format,
        season,
        episode,
        status: "pending",
        latencyMs: 0,
        isActive: false,
        successCount: 0,
        failCount: 0,
      })
      .returning();

    return NextResponse.json({ source: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/movies error:", err);
    return NextResponse.json(
      { error: "Failed to add source" },
      { status: 500 }
    );
  }
}
