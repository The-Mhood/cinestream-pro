import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { mediaItems, streamSources } from "@/db/schema";
import CatalogExplorer from "@/components/CatalogExplorer";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeeded();

  const [media, sources] = await Promise.all([
    db.select().from(mediaItems).orderBy(desc(mediaItems.isTrending), desc(mediaItems.rating)),
    db.select({
      mediaId: streamSources.mediaId,
      status: streamSources.status,
      isActive: streamSources.isActive,
      quality: streamSources.quality,
    }).from(streamSources),
  ]);

  const sourceStats = new Map<number, { total: number; active: number; maxQuality: string }>();
  const qualityRank: Record<string, number> = { "4K": 3, "1080p": 2, "720p": 1 };

  for (const source of sources) {
    const stats = sourceStats.get(source.mediaId) ?? {
      total: 0,
      active: 0,
      maxQuality: "Unverified",
    };
    stats.total += 1;
    if (source.status === "active" && source.isActive) {
      stats.active += 1;
      if ((qualityRank[source.quality] ?? 0) > (qualityRank[stats.maxQuality] ?? 0)) {
        stats.maxQuality = source.quality;
      }
    }
    sourceStats.set(source.mediaId, stats);
  }

  const initialItems = media.map((item) => {
    const stats = sourceStats.get(item.id) ?? {
      total: 0,
      active: 0,
      maxQuality: "Unverified",
    };
    return {
      ...item,
      sourceCount: stats.total,
      activeSourceCount: stats.active,
      maxQuality: stats.maxQuality,
    };
  });

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-slate-400">
          Loading catalogue...
        </div>
      }
    >
      <CatalogExplorer initialItems={initialItems} />
    </Suspense>
  );
}
