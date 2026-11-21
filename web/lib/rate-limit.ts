// Simple per-IP (and per-user) limits to stop abuse running up AI and Maps bills. In-memory, so
// it is per server instance: a basic guard, not a replacement for a firewall rule.
//
// Privacy: keys (IP addresses, user ids) are kept only while they have hits inside the last
// minute. Expired keys are swept at most once per window, whatever the map size, so no key
// outlives its window by more than about one more minute (matches the privacy page).
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
let lastSweep = 0;

/** Most keys kept at once; past this the oldest go first, so rotating keys cannot grow memory. */
const MAX_KEYS = 50_000;

// x-real-ip / x-forwarded-for are trusted only where a proxy sets them: on Vercel, or when
// TRUST_PROXY=1 (self-hosted behind nginx, Caddy and the like). Anywhere else a client could pick
// a fresh "IP" per request, so all direct clients share one bucket; the per-user and per-account
// limits are the real guard. Capped at 64 characters so a forged header cannot grow the keys.
export function clientIp(req: Request): string {
  if (!process.env.VERCEL && process.env.TRUST_PROXY !== "1") return "direct";
  return (req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown").slice(0, 64);
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
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string);
  return null;
}

/** Returns a 429 response when this IP is over `perMinute` in `bucket`, otherwise null. */
export function rateLimit(req: Request, bucket: string, perMinute: number): Response | null {
  return rateLimitKey(`${bucket}:${clientIp(req)}`, perMinute);
}

/** Link-code tries per chat account per minute: a cheap extra brake. Codes are 10 characters
 * (about 49.5 bits) and live 10 minutes, so guessing fails even across many accounts. */
export const LINK_TRIES_PER_MIN = 3;

/** True when this chat account (Telegram, Discord or Slack user) may try another link code. The bot
 * webhooks all come from the platform's servers, so this is keyed by the chat user, not the IP. */
export function linkTryAllowed(platform: string, platformUserId: string, teamId = ""): boolean {
  return rateLimitKey(`link-try:${platform}:${teamId}:${platformUserId}`, LINK_TRIES_PER_MIN) === null;
}
