// Simple per-IP (and per-user) limits to stop abuse running up AI and Maps bills. In-memory, so
// it is per server instance: a basic guard, not a replacement for a firewall rule.
//
// Privacy: keys (IP addresses, user ids) are kept only while they have hits inside the last
// minute. Expired keys are swept at most once per window, whatever the map size, so no key
// outlives its window by more than about one more minute (matches the privacy page).
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
let lastSweep = 0;

function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function sweep(now: number): void {
  if (now - lastSweep <= WINDOW_MS) return;
  lastSweep = now;
  for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
}

/** Returns a 429 response when `key` is over `perMinute`, otherwise null. */
export function rateLimitKey(key: string, perMinute: number): Response | null {
  const now = Date.now();
  sweep(now);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= perMinute) {
    hits.set(key, recent);
    return Response.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}

/** Returns a 429 response when this IP is over `perMinute` in `bucket`, otherwise null. */
export function rateLimit(req: Request, bucket: string, perMinute: number): Response | null {
  return rateLimitKey(`${bucket}:${clientIp(req)}`, perMinute);
}
