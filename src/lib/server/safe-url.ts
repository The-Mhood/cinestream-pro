/**
 * Server-side outbound URL policy for media-source registration and verification.
 *
 * Only operator-approved HTTPS hosts may be contacted. Configure exact hostnames
 * in STREAM_PROBE_ALLOWED_HOSTS (comma-separated). Redirects are revalidated.
 */
const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function configuredHosts(): Set<string> {
  return new Set(
    (process.env.STREAM_PROBE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase().replace(/\.$/, ""))
      .filter(Boolean)
  );
}

export function validateOutboundUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS source URLs are permitted");
  }
  if (url.username || url.password) {
    throw new Error("URLs containing credentials are not permitted");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    /^\d+(\.\d+){3}$/.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new Error("Private, local, or IP-literal destinations are not permitted");
  }

  if (!configuredHosts().has(hostname)) {
    throw new Error("Source host is not in STREAM_PROBE_ALLOWED_HOSTS");
  }

  url.hash = "";
  return url;
}

function sniffMediaFormat(bytes: Uint8Array): "HLS" | "DASH" | "MP4" | "WEBM" | null {
  const prefix = new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.length, 512)))
    .replace(/^\uFEFF/, "")
    .trimStart();

  if (prefix.startsWith("#EXTM3U")) return "HLS";
  if (/<MPD(?:\s|>)/i.test(prefix)) return "DASH";

  if (
    bytes.length >= 8 &&
    String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp"
  ) {
    return "MP4";
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "WEBM";
  }

  return null;
}

export async function verifyApprovedMediaUrl(
  input: string,
  expectedFormat = ""
): Promise<{
  ok: boolean;
  latencyMs: number;
  statusCode: number | null;
  detectedFormat: string | null;
}> {
  const startedAt = Date.now();
  let current = validateOutboundUrl(input);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(current, {
        method: "GET",
        headers: {
          Range: "bytes=0-4095",
          "User-Agent": "CineStreamPro-MediaVerifier/1.0",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location || redirectCount === 3) {
          return {
            ok: false,
            latencyMs: Date.now() - startedAt,
            statusCode: response.status,
            detectedFormat: null,
          };
        }
        current = validateOutboundUrl(new URL(location, current).toString());
        continue;
      }

      if (response.status !== 200 && response.status !== 206) {
        await response.body?.cancel().catch(() => undefined);
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          statusCode: response.status,
          detectedFormat: null,
        };
      }

      const reader = response.body?.getReader();
      if (!reader) {
        return {
          ok: false,
          latencyMs: Date.now() - startedAt,
          statusCode: response.status,
          detectedFormat: null,
        };
      }

      let firstChunk: Uint8Array | undefined;
      try {
        firstChunk = (await reader.read()).value;
      } finally {
        await reader.cancel().catch(() => undefined);
      }

      const detectedFormat = firstChunk
        ? sniffMediaFormat(firstChunk.subarray(0, 4096))
        : null;
      const expected = expectedFormat.trim().toUpperCase();
      const expectedMatches =
        !expected ||
        (expected === "HLS" && detectedFormat === "HLS") ||
        ((expected === "DASH" || expected === "MPEG-DASH") && detectedFormat === "DASH") ||
        (expected === "MP4" && detectedFormat === "MP4") ||
        (expected === "WEBM" && detectedFormat === "WEBM");

      return {
        ok: detectedFormat !== null && expectedMatches,
        latencyMs: Math.max(1, Date.now() - startedAt),
        statusCode: response.status,
        detectedFormat,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    latencyMs: Date.now() - startedAt,
    statusCode: null,
    detectedFormat: null,
  };
}
