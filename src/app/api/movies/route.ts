import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaItems, streamSources } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { desc, eq } from "drizzle-orm";
import { validateOutboundUrl } from "@/lib/server/safe-url";

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
        maxQuality: "720p",
      };
      entry.total += 1;
      if (src.status === "active" && src.isActive) {
        entry.active += 1;
      }
      if (src.quality === "4K") {
        entry.maxQuality = "4K";
      } else if (src.quality === "1080p" && entry.maxQuality !== "4K") {
        entry.maxQuality = "1080p";
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
  // Allow adding a custom stream source or title from Aggregator UI
  try {
    await ensureSeeded();
    const body = await request.json();
    const {
      mediaId,
      providerName,
      serverLabel,
      url,
      quality = "1080p",
      format = "HLS",
      season = 1,
      episode = 1,
    } = body;

    if (!mediaId || !providerName || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { error: "mediaId, providerName, and url are required" },
        { status: 400 }
      );
    }

    let approvedUrl: URL;\n    try {\n      approvedUrl = validateOutboundUrl(url);\n    } catch (error) {\n      return NextResponse.json(\n        { error: error instanceof Error ? error.message : "Source URL is not permitted" },\n        { status: 400 }\n      );\n    }\n\n    const [media] = await db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.id, Number(mediaId)))
      .limit(1);

    if (!media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    const [created] = await db
      .insert(streamSources)
      .values({
        mediaId: media.id,
        providerName,
        serverLabel: serverLabel || `${providerName} Custom`,
        url,
        quality,
        format,
        season: Number(season),
        episode: Number(episode),
        status: "active",
        latencyMs: 30,
        isActive: true,
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
