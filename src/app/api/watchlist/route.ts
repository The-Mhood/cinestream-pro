import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaItems, streamSources, watchlistItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { ensureSeeded } from "@/lib/seed";
import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ items: [], authenticated: false });
    }

    const entries = await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, user.id))
      .orderBy(desc(watchlistItems.lastWatchedAt));

    const allMedia = await db.select().from(mediaItems);
    const allSources = await db.select().from(streamSources);
    const mediaMap = new Map(allMedia.map((m) => [m.id, m]));

    const sourceCountMap = new Map<number, number>();
    for (const src of allSources) {
      if (src.status === "active" && src.isActive) {
        sourceCountMap.set(src.mediaId, (sourceCountMap.get(src.mediaId) ?? 0) + 1);
      }
    }

    const enriched = entries
      .map((entry) => {
        const media = mediaMap.get(entry.mediaId);
        if (!media) return null;
        return {
          ...entry,
          media: {
            ...media,
            activeSourceCount: sourceCountMap.get(media.id) ?? 0,
          },
        };
      })
      .filter(Boolean);

    return NextResponse.json({ items: enriched, authenticated: true });
  } catch (err) {
    console.error("GET /api/watchlist error:", err);
    return NextResponse.json(
      { error: "Failed to load watchlist" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSeeded();
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Please sign in to save to your library" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      mediaId,
      action = "toggle",
      progressSeconds,
      lastServerId,
    } = body as {
      mediaId: number;
      action?: "toggle" | "progress";
      progressSeconds?: number;
      lastServerId?: number;
    };

    if (!mediaId) {
      return NextResponse.json(
        { error: "mediaId is required" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.userId, user.id),
          eq(watchlistItems.mediaId, Number(mediaId))
        )
      )
      .limit(1);

    if (action === "progress") {
      if (existing) {
        const [updated] = await db
          .update(watchlistItems)
          .set({
            progressSeconds:
              typeof progressSeconds === "number"
                ? Math.floor(progressSeconds)
                : existing.progressSeconds,
            lastServerId: lastServerId ?? existing.lastServerId,
            lastWatchedAt: new Date(),
          })
          .where(eq(watchlistItems.id, existing.id))
          .returning();
        return NextResponse.json({ item: updated });
      } else {
        const [created] = await db
          .insert(watchlistItems)
          .values({
            userId: user.id,
            mediaId: Number(mediaId),
            inWatchlist: false,
            progressSeconds:
              typeof progressSeconds === "number"
                ? Math.floor(progressSeconds)
                : 0,
            lastServerId: lastServerId ?? null,
          })
          .returning();
        return NextResponse.json({ item: created });
      }
    }

    // Toggle watchlist membership
    if (existing) {
      const nextState = !existing.inWatchlist;
      const [updated] = await db
        .update(watchlistItems)
        .set({ inWatchlist: nextState })
        .where(eq(watchlistItems.id, existing.id))
        .returning();
      return NextResponse.json({
        item: updated,
        inWatchlist: updated.inWatchlist,
      });
    } else {
      const [created] = await db
        .insert(watchlistItems)
        .values({
          userId: user.id,
          mediaId: Number(mediaId),
          inWatchlist: true,
          progressSeconds: 0,
        })
        .returning();
      return NextResponse.json({
        item: created,
        inWatchlist: true,
      });
    }
  } catch (err) {
    console.error("POST /api/watchlist error:", err);
    return NextResponse.json(
      { error: "Failed to update watchlist" },
      { status: 500 }
    );
  }
}
