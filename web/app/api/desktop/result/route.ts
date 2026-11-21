// POST { jobId, ok, message, denied?, expired? } (Authorization: Bearer <device token>) -> { ok }:
// what happened to a job (done, denied by the person, expired before anyone answered, or
// failed). 404 when the job is not this device's, already finished or expired.
import { readJson, serverError } from "@/lib/bots/guard";
import { supabaseConfigured } from "@/lib/cloud";
import { bearerToken, deviceFromToken, finishDesktopJob } from "@/lib/desktop";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "desktop-result", 60);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "linking_unavailable" }, { status: 503 });
  try {
    const device = await deviceFromToken(bearerToken(req));
    if (!device) return Response.json({ error: "bad_token" }, { status: 401 });
    const body = await readJson<{ jobId?: unknown; ok?: unknown; message?: unknown; denied?: unknown; expired?: unknown }>(req, 4096);
    if (typeof body?.jobId !== "string" || typeof body.ok !== "boolean") return Response.json({ error: "bad_result" }, { status: 400 });
    const outcome = body.ok ? "done" : body.denied === true ? "denied" : body.expired === true ? "expired" : "failed";
    const message = typeof body.message === "string" ? body.message : "";
    if (!(await finishDesktopJob(device, body.jobId, outcome, message))) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError("desktop/result", e);
  }
}
