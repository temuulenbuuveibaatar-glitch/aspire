import { requireUser, signedOut } from "@/lib/auth";
import { findCameras, validLatLng } from "@/lib/cameras";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// GET /api/cameras?lat=49.03&lng=104.08 -> { cameras, credit, unavailable, updatedAt }.
// Public cameras only (lib/cameras.ts). Position is rounded to 3 decimals (~100 m) before use.
export async function GET(req: Request) {
  const limited = rateLimit(req, "cameras", 30);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`cameras:${user.id}`, 10);
  if (perUser) return perUser;

  const q = new URL(req.url).searchParams;
  const read = (k: string) => {
    const v = q.get(k)?.trim() ?? "";
    return /^-?\d{1,3}(\.\d{1,10})?$/.test(v) ? Math.round(Number(v) * 1000) / 1000 : NaN;
  };
  const lat = read("lat");
  const lng = read("lng");
  if (!validLatLng(lat, lng)) return Response.json({ error: "bad_position" }, { status: 400 });

  try {
    const result = await findCameras({ lat, lng }, { userId: user.id });
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    console.error("cameras:", e instanceof Error ? e.name : "error");
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
