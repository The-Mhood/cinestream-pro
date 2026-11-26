/**
 * Server-side outbound URL policy for media-source registration and health probes.
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
      .map((host) => host.trim().toLowerCase().replace(/\\.$/, ""))
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

  const hostname = url.hostname.toLowerCase().replace(/\\.$/, "");
  if (
    !hostname ||
    BLOCKED_HOSTS.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    /^\\d+(\\.\\d+){3}$/.test(hostname) ||
    hostname.includes(":")
  ) {
    throw new Error("Private, local, or IP-literal destinations are not permitted");
  }

  const allowed = configuredHosts();
  if (!allowed.has(hostname)) {
    throw new Error("Source host is not in STREAM_PROBE_ALLOWED_HOSTS");
  }

  // Fragments are never sent to the remote server and can make URL comparisons
  // misleading, so remove them before persisting or probing.
  url.hash = "";
  return url;
}

export async function probeApprovedUrl(
  input: string,
  timeoutMs = 3000
): Promise<{ ok: boolean; latencyMs: number; statusCode: number | null }> {
  const startedAt = Date.now();
  let current = validateOutboundUrl(input);

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "CineStreamPro-SourceHealth/1.0" },
      });
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 3) {
        return { ok: false, latencyMs: Date.now() - startedAt, statusCode: response.status };
      }
      current = validateOutboundUrl(new URL(location, current).toString());
      continue;
    }

    return {
      ok: response.status === 200 || response.status === 206,
      latencyMs: Math.max(1, Date.now() - startedAt),
      statusCode: response.status,
    };
  }

  return { ok: false, latencyMs: Date.now() - startedAt, statusCode: null };
}
