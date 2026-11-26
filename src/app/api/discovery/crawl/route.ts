import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DiscoveryRequest {
  start_urls: string[];
  max_pages?: number;
  max_depth?: number;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  }

  const backendUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL;
  const apiKey = process.env.DISCOVERY_API_KEY;
  if (!backendUrl || !apiKey) {
    return NextResponse.json(
      { error: "Authorized discovery backend is not configured" },
      { status: 503 }
    );
  }

  let payload: DiscoveryRequest;
  try {
    payload = (await request.json()) as DiscoveryRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (
    !Array.isArray(payload.start_urls) ||
    payload.start_urls.length < 1 ||
    payload.start_urls.length > 10 ||
    payload.start_urls.some(
      (url) => typeof url !== "string" || url.length > 2048 || !url.trim()
    )
  ) {
    return NextResponse.json(
      { error: "Provide between 1 and 10 valid start URLs" },
      { status: 400 }
    );
  }

  const maxPages = payload.max_pages ?? 50;
  const maxDepth = payload.max_depth ?? 2;
  if (
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 100 ||
    !Number.isInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > 3
  ) {
    return NextResponse.json(
      { error: "max_pages must be 1–100 and max_depth must be 0–3" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      new URL("/api/discovery/crawl", backendUrl),
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${apiKey}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start_urls: payload.start_urls,
          max_pages: maxPages,
          max_depth: maxDepth,
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(120_000),
      }
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: result.detail || "Discovery service rejected the request" },
        { status: response.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      { error: timedOut ? "Discovery run exceeded the 120-second limit" : "Discovery service is unavailable" },
      { status: timedOut ? 504 : 502 }
    );
  }
}
