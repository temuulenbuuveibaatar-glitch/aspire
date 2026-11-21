import { cityParam, getAmbient, locate } from "@/lib/ambient";
import { requireUser, signedOut } from "@/lib/auth";
import { isLang, type Lang } from "@/lib/lang";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// POST /api/ambient { lang, lat?, lng?, city? } -> Ambient (lib/ambient-types.ts).
// GET  /api/ambient?lang=  -> the same from the network position only.
// Position: the device's lat/lng (4 decimals) when the person allowed it, else the city they set,
// else Vercel's city-level IP location, else none. Used for this answer only, never stored. It travels
// in the POST body, never in the URL, so request logs do not keep a location trail.
//
// Budget guard: every new place misses the caches and costs several Google calls, so the real
// client (one request per open, then one every 3 minutes) is limited per user, and a user who asks
// for many distinct places (1 km cells or cities) in an hour gets the network position instead.
// The per-minute limit leaves room for a few reloads and a language switch: at 6 the fourth reload in
// a minute left the dashboard empty. Repeat places come from the cache, and the places guard below
// is what bounds the paid lookups.
const PER_USER_PER_MIN = 20;
const MAX_PLACES_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;
const places = new Map<string, { hour: number; keys: Set<string> }>();

/** The cache-relevant place a query asks for: a 2-decimal cell or a typed city; null for none. */
function placeKey(q: URLSearchParams): string | null {
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (q.get("lat") && q.get("lng") && Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const city = cityParam(q.get("city"));
  return city ? `city:${city.toLowerCase()}` : null;
}

/** False once this user has asked for more than MAX_PLACES_PER_HOUR distinct places this hour. */
function placeAllowed(userId: string, key: string | null, now: number): boolean {
  if (key === null) return true;
  const hour = Math.floor(now / HOUR_MS);
  let entry = places.get(userId);
  if (!entry || entry.hour !== hour) {
    entry = { hour, keys: new Set() };
    places.delete(userId);
    places.set(userId, entry);
    if (places.size > 5000) {
      for (const [k, v] of places) if (v.hour !== hour) places.delete(k);
    }
  }
  if (entry.keys.has(key)) return true;
  if (entry.keys.size >= MAX_PLACES_PER_HOUR) return false;
  entry.keys.add(key);
  return true;
}

async function answer(req: Request, q: URLSearchParams, cache: string): Promise<Response> {
  const limited = rateLimit(req, "ambient", 12);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`ambient:${user.id}`, PER_USER_PER_MIN);
  if (perUser) return perUser;

  const langParam = q.get("lang");
  const lang: Lang = isLang(langParam) ? langParam : "en";
  const params = placeAllowed(user.id, placeKey(q), Date.now()) ? q : new URLSearchParams();
  const data = await getAmbient(await locate(params, req.headers), lang, new Date());
  return Response.json(data, { headers: { "Cache-Control": cache } });
}

export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("lang");
  return answer(req, new URLSearchParams(lang ? { lang } : {}), "private, max-age=300");
}

/** Trust boundary: only finite numbers in range and a short string city pass (locate() checks again). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const q = new URLSearchParams();
  if (body && typeof body === "object") {
    const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max ? v : null);
    const lat = num(body.lat, 90);
    const lng = num(body.lng, 180);
    if (typeof body.lang === "string") q.set("lang", body.lang.slice(0, 5));
    if (lat !== null && lng !== null) {
      q.set("lat", lat.toFixed(4));
      q.set("lng", lng.toFixed(4));
    } else if (typeof body.city === "string") q.set("city", body.city.slice(0, 80));
  }
  return answer(req, q, "private, no-store");
}
