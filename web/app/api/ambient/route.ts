import { getAmbient, locate } from "@/lib/ambient";
import { requireUser, signedOut } from "@/lib/auth";
import { isLang, type Lang } from "@/lib/lang";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// GET /api/ambient?lat=&lng=&lang= -> Ambient (lib/ambient-types.ts).
// Position: the device's lat/lng when the person allowed it, else Vercel's city-level IP
// location, else none. Rounded to about 1 km, used for this answer only, never stored.
//
// Budget guard: every new rounded position misses the cache and costs several Google calls, so
// the real client (about one request per 10 minutes) is limited per user, and a user who sends
// many distinct positions in an hour gets the network position instead of the query one.
const PER_USER_PER_MIN = 6;
const MAX_CELLS_PER_HOUR = 5;
const HOUR_MS = 60 * 60_000;
const cells = new Map<string, { hour: number; cells: Set<string> }>();

/** False once this user has asked for more than MAX_CELLS_PER_HOUR distinct positions this hour. */
function positionAllowed(userId: string, lat: string | null, lng: string | null, now: number): boolean {
  if (lat === null || lng === null) return true;
  const hour = Math.floor(now / HOUR_MS);
  let entry = cells.get(userId);
  if (!entry || entry.hour !== hour) {
    entry = { hour, cells: new Set() };
    cells.delete(userId);
    cells.set(userId, entry);
    if (cells.size > 5000) {
      for (const [k, v] of cells) if (v.hour !== hour) cells.delete(k);
    }
  }
  const key = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
  if (entry.cells.has(key)) return true;
  if (entry.cells.size >= MAX_CELLS_PER_HOUR) return false;
  entry.cells.add(key);
  return true;
}

export async function GET(req: Request) {
  const limited = rateLimit(req, "ambient", 12);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`ambient:${user.id}`, PER_USER_PER_MIN);
  if (perUser) return perUser;

  const url = new URL(req.url);
  const langParam = url.searchParams.get("lang");
  const lang: Lang = isLang(langParam) ? langParam : "en";
  const params = positionAllowed(user.id, url.searchParams.get("lat"), url.searchParams.get("lng"), Date.now())
    ? url.searchParams
    : new URLSearchParams();
  const data = await getAmbient(locate(params, req.headers), lang, new Date());
  return Response.json(data, { headers: { "Cache-Control": "private, max-age=300" } });
}
