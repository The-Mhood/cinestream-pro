import React from "react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { mediaItems, streamSources, watchlistItems } from "@/db/schema";
import { ensureSeeded } from "@/lib/seed";
import { getCurrentUser } from "@/lib/auth";
import { and, asc, eq } from "drizzle-orm";
import WatchView from "@/components/WatchView";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await ensureSeeded();
  const { id } = await params;
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
    notFound();
  }

  const sources = await db
    .select()
    .from(streamSources)
    .where(eq(streamSources.mediaId, media.id))
    .orderBy(
      asc(streamSources.season),
      asc(streamSources.episode),
      asc(streamSources.id)
    );

  const user = await getCurrentUser();
  let wlEntry = null;
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
    wlEntry = entry ?? null;
  }

  return (
    <WatchView
      media={media}
      initialSources={sources}
      initialInWatchlist={wlEntry?.inWatchlist ?? false}
      initialProgressSeconds={wlEntry?.progressSeconds ?? 0}
      initialServerId={wlEntry?.lastServerId ?? null}
    />
  );
}
