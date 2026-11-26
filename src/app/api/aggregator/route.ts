import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  providers,
  aggregationRuns,
  mediaItems,
  streamSources,
} from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { desc, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeeded();

    const [allProviders, recentRuns, allMedia, allSources] = await Promise.all([
      db.select().from(providers).orderBy(asc(providers.id)),
      db
        .select()
        .from(aggregationRuns)
        .orderBy(desc(aggregationRuns.startedAt))
        .limit(10),
      db.select({ id: mediaItems.id, title: mediaItems.title }).from(mediaItems),
      db.select().from(streamSources),
    ]);

    const activeSources = allSources.filter((s) => s.status === "active" && s.isActive).length;
    const offlineSources = allSources.filter((s) => s.status === "offline" || s.status === "degraded").length;
    const pendingSources = allSources.filter((s) => s.status === "pending" || s.status === "unverified").length;
    const avgLatency =
      activeSources > 0
        ? Math.round(
            allSources
              .filter((s) => s.status === "active" && s.isActive)
              .reduce((acc, s) => acc + s.latencyMs, 0) / activeSources
          )
        : 0;

    return NextResponse.json({
      providers: allProviders,
      runs: recentRuns,
      catalogTitles: allMedia,
      stats: {
        totalTitles: allMedia.length,
        totalSources: allSources.length,
        activeSources,
        offlineSources,
        pendingSources,
        avgLatencyMs: avgLatency,
      },
    });
  } catch (err) {
    console.error("GET /api/aggregator error:", err);
    return NextResponse.json(
      { error: "Failed to load aggregator telemetry" },
      { status: 500 }
    );
  }
}
