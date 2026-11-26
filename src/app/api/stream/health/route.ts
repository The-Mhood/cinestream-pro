import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { streamSources } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { probeApprovedUrl, validateOutboundUrl } from "@/lib/server/safe-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sourceId = Number(searchParams.get("sourceId"));
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  }

  const [source] = await db
    .select()
    .from(streamSources)
    .where(eq(streamSources.id, sourceId))
    .limit(1);

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  try {\n    validateOutboundUrl(source.url);\n  } catch (error) {\n    return NextResponse.json(\n      { error: error instanceof Error ? error.message : "Source host is not approved" },\n      { status: 403 }\n    );\n  }\n\n  const result = await probeApprovedUrl(source.url).catch(() => ({\n    ok: false, latencyMs: 999, statusCode: null,\n  }));
  const newStatus = result.ok ? "active" : "offline";

  const [updated] = await db
    .update(streamSources)
    .set({
      status: newStatus,
      latencyMs: result.latencyMs,
      isActive: result.ok,
      lastCheckedAt: new Date(),
      successCount: result.ok
        ? sql`${streamSources.successCount} + 1`
        : streamSources.successCount,
      failCount: !result.ok
        ? sql`${streamSources.failCount} + 1`
        : streamSources.failCount,
    })
    .where(eq(streamSources.id, source.id))
    .returning();

  return NextResponse.json({ source: updated });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceId, event } = body as {
      sourceId: number;
      event?: "probe" | "playback_ok" | "playback_error";
    };

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId required" }, { status: 400 });
    }

    const [source] = await db
      .select()
      .from(streamSources)
      .where(eq(streamSources.id, Number(sourceId)))
      .limit(1);

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (event === "playback_error") {
      const [updated] = await db
        .update(streamSources)
        .set({
          status: "offline",
          isActive: false,
          failCount: sql`${streamSources.failCount} + 1`,
          lastCheckedAt: new Date(),
        })
        .where(eq(streamSources.id, source.id))
        .returning();
      return NextResponse.json({ source: updated });
    }

    if (event === "playback_ok") {
      const [updated] = await db
        .update(streamSources)
        .set({
          status: "active",
          isActive: true,
          successCount: sql`${streamSources.successCount} + 1`,
          lastCheckedAt: new Date(),
        })
        .where(eq(streamSources.id, source.id))
        .returning();
      return NextResponse.json({ source: updated });
    }

    try {\n      validateOutboundUrl(source.url);\n    } catch (error) {\n      return NextResponse.json(\n        { error: error instanceof Error ? error.message : "Source host is not approved" },\n        { status: 403 }\n      );\n    }\n\n    const result = await probeApprovedUrl(source.url).catch(() => ({\n      ok: false, latencyMs: 999, statusCode: null,\n    }));
    const [updated] = await db
      .update(streamSources)
      .set({
        status: result.ok ? "active" : "offline",
        latencyMs: result.latencyMs,
        isActive: result.ok,
        lastCheckedAt: new Date(),
      })
      .where(eq(streamSources.id, source.id))
      .returning();

    return NextResponse.json({ source: updated });
  } catch (err) {
    console.error("POST /api/stream/health error:", err);
    return NextResponse.json(
      { error: "Health check failed" },
      { status: 500 }
    );
  }
}
