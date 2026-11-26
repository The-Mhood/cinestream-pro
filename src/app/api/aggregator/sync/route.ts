import { NextResponse } from "next/server";
import { runSourceDiscovery } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const run = await runSourceDiscovery();
    return NextResponse.json({ run });
  } catch (err) {
    console.error("POST /api/aggregator/sync error:", err);
    return NextResponse.json(
      { error: "Source discovery sync failed" },
      { status: 500 }
    );
  }
}
