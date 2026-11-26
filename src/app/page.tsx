import React, { Suspense } from "react";
import { db } from "@/db";
import { mediaItems, streamSources } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { desc } from "drizzle-orm";
import CatalogExplorer from "@/components/CatalogExplorer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureSeeded();

  const [allMedia, allSources] = await Promise.all([
    db
      .select()
      .from(mediaItems)
      .orderBy(desc(mediaItems.isTrending), desc(mediaItems.rating)),
    db.select().from(streamSources),
  ]);

  const statsMap = new Map<
    number,
    { total: number; active: number; maxQuality: string }
  >();

  for (const src of allSources) {
    const entry = statsMap.get(src.mediaId) ?? {
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
    statsMap.set(src.mediaId, entry);
  }

  const enriched = allMedia.map((m) => {
    const st = statsMap.get(m.id) ?? {
      total: 0,
      active: 0,
      maxQuality: "1080p",
    };
    return {
      ...m,
      sourceCount: st.total,
      activeSourceCount: st.active,
      maxQuality: st.maxQuality,
    };
  });

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-slate-400">
          Loading CineStream Pro catalog...
        </div>
      }
    >
      <CatalogExplorer initialItems={enriched} />
    </Suspense>
  );
}
