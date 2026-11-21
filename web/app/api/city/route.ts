import { requireUser, signedOut } from "@/lib/auth";
import { cityData } from "@/lib/erdenet-city";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// GET /api/city?lat=&lng= -> { traffic, parking, fuel, cameras, credit, down? } (types: CityData in lib/erdenet-city.ts)
// Erdenet (within 30 km): traffic cameras with counts and load, parking free spaces (approx., camera vision),
// fuel per station and type, and the city's live cameras page to embed. Ulaanbaatar (within 40 km): only a
// link to ubtraffic.mn (their streams are not open). Elsewhere: all null. A feed that fails is listed in
// `down` (its part is null), never shown as an empty city. Upstream is cached server-side (30 s / 60 s / 5 min).

const coord = (v: string | null, max: number) => {
  const n = v !== null && /^-?\d{1,3}(\.\d{1,8})?$/.test(v) ? Number(v) : NaN;
  return Math.abs(n) <= max ? n : null;
};

export async function GET(req: Request) {
  const limited = rateLimit(req, "city", 240);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`city:${user.id}`, 20);
  if (perUser) return perUser;

  const url = new URL(req.url);
  const lat = coord(url.searchParams.get("lat"), 90), lng = coord(url.searchParams.get("lng"), 180);
  if (lat === null || lng === null) return Response.json({ error: "bad_location" }, { status: 400 });
  return Response.json(await cityData(lat, lng), { headers: { "Cache-Control": "private, max-age=30" } });
}
