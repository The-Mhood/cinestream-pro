import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { streamSources } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { validateOutboundUrl, verifyApprovedMediaUrl } from "@/lib/server/safe-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }

  const rate = checkRateLimit(`media-probe:${user.id}`, 30, 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Health probe rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const sourceId = Number(new URL(request.url).searchParams.get("sourceId"));
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
    return NextResponse.json({ error: "A valid sourceId is required" }, { status: 400 });
  }

  const [source] = await db
    .select()
    .from(streamSources)
    .where(eq(streamSources.id, sourceId))
    .limit(1);

  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  try {
    validateOutboundUrl(source.url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Source host is not approved" },
      { status: 403 }
    );
  }

  const result = await verifyApprovedMediaUrl(source.url, source.format).catch(() => ({
    ok: false,
    latencyMs: 999,
    statusCode: null,
    detectedFormat: null,
  }));

  const [updated] = await db
    .update(streamSources)
    .set({
      status: result.ok ? "active" : "offline",
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

  return NextResponse.json({ source: updated, verification: result });
}
