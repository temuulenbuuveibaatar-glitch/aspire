import { requireUser, signedOut } from "@/lib/auth";
import { arrivals, getStatic, liveVehicles } from "@/lib/erdenet-transit";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// GET /api/transit         -> Erdenet's live network: { vehicles, stations, paths, routes, updatedAt }
// GET /api/transit?live=1  -> { vehicles, updatedAt } only (the client polls this every 10 s once it has the network)
// GET /api/transit?stop=<station id> -> { arrivals } (minutes estimated from live positions, stale buses left out)
// Each vehicle also carries ageS (seconds since its position), stale (ageS > 60) and routeName/routeShort/routeColor
// (null when no route matched). Feed down: 503 { error: "unavailable" }, never an empty list that looks like "no buses".
// Data: Orkhon ТКХДТ open feed, cached server-side (static 6 h, vehicles 10 s), so upstream sees at most one
// call per 10 s per instance whatever the client traffic. The per-IP limit is generous because Mongolian
// carriers put many people behind one CGNAT address; the per-user limit is the real guard.

export async function GET(req: Request) {
  const limited = rateLimit(req, "transit", 240);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`transit:${user.id}`, 20);
  if (perUser) return perUser;

  const url = new URL(req.url);
  const headers = { "Cache-Control": "private, max-age=10" };
  const stop = url.searchParams.get("stop");

  try {
    if (stop !== null) {
      if (!/^[\w-]{1,40}$/.test(stop)) return Response.json({ error: "bad_stop" }, { status: 400 });
      return Response.json({ arrivals: await arrivals(stop) }, { headers });
    }
    const vehicles = await liveVehicles();
    const updatedAt = vehicles.reduce<string | null>((max, v) => (!max || v.updatedAt > max ? v.updatedAt : max), null);
    if (url.searchParams.get("live") === "1") return Response.json({ vehicles, updatedAt }, { headers });
    const st = await getStatic();
    return Response.json({ vehicles, stations: st.stations, paths: st.paths, routes: st.routes, updatedAt }, { headers });
  } catch (e) {
    console.error("transit:", e instanceof Error ? e.message : "error");
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
