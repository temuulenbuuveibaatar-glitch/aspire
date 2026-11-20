// Simple per-IP limit to stop abuse running up AI bills. In-memory, so it is
// per server instance: a basic guard, not a replacement for a firewall rule.
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Returns a 429 response when over `perMinute`, otherwise null. */
export function rateLimit(req: Request, bucket: string, perMinute: number): Response | null {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= perMinute) {
    return Response.json({ error: "busy" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return null;
}
