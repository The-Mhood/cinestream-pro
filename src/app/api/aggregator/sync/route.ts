import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "The legacy static discovery feed is disabled. Use the authorized crawler on the Source Watcher page.",
    },
    { status: 410 }
  );
}
