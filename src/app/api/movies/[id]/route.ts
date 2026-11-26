import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mediaItems, streamSources, watchlistItems } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { getCurrentUser } from "@/lib/auth";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeeded();
    const { id } = await context.params;
    const numericId = Number(id);

    const [media] = Number.isFinite(numericId)
      ? await db
          .select()
          .from(mediaItems)
          .where(eq(mediaItems.id, numericId))
          .limit(1)
      : await db
          .select()
          .from(mediaItems)
          .where(eq(mediaItems.slug, id))
          .limit(1);

    if (!media) {
      return NextResponse.json({ error: "Title not found" }, { status: 404 });
    }

    const sources = await db
      .select()
      .from(streamSources)
      .where(eq(streamSources.mediaId, media.id))
      .orderBy(asc(streamSources.season), asc(streamSources.episode), asc(streamSources.id));

    const user = await getCurrentUser();
    let watchlistEntry = null;
    if (user) {
      const [entry] = await db
        .select()
        .from(watchlistItems)
        .where(
          and(
            eq(watchlistItems.userId, user.id),
            eq(watchlistItems.mediaId, media.id)
          )
        )
        .limit(1);
      watchlistEntry = entry ?? null;
    }

    return NextResponse.json({
      media,
      sources,
      inWatchlist: watchlistEntry?.inWatchlist ?? false,
      progressSeconds: watchlistEntry?.progressSeconds ?? 0,
      lastServerId: watchlistEntry?.lastServerId ?? null,
    });
  } catch (err) {
    console.error("GET /api/movies/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to load media details" },
      { status: 500 }
    );
  }
}
