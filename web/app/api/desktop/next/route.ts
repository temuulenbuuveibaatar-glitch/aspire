// GET (Authorization: Bearer <device token>) -> { job } | { job: null }: the next job for this
// device, handed out once, with expiresInMs (time left; the helper times it on its own clock).
// The helper polls every few seconds; 401 means it was unlinked.
import { serverError } from "@/lib/bots/guard";
import { supabaseConfigured } from "@/lib/cloud";
import { bearerToken, deviceFromToken, nextDesktopJob } from "@/lib/desktop";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const limited = rateLimit(req, "desktop-next", 120);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "linking_unavailable" }, { status: 503 });
  // Read the header outside try: at build time this access ends prerendering, which must not be caught.
  const token = bearerToken(req);
  try {
    const device = await deviceFromToken(token);
    if (!device) return Response.json({ error: "bad_token" }, { status: 401 });
    const busy = rateLimitKey(`desktop-next:${device.id}`, 40);
    if (busy) return busy;
    const job = await nextDesktopJob(device);
    return Response.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError("desktop/next", e);
  }
}
