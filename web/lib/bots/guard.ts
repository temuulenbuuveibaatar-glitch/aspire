// Shared checks for the account-linking and sync routes (all need a signed-in person and the
// database). Server only.
import { requireUser, signedOut, type SessionUser } from "@/lib/auth";
import { readText } from "@/lib/body";
import { supabaseConfigured } from "@/lib/cloud";
import { rateLimit } from "@/lib/rate-limit";

/** The signed-in person, or the Response to return (429 busy, 401 signed out, 503 no database). */
export async function linkingUser(req: Request, bucket: string, perMinute = 30): Promise<SessionUser | Response> {
  const limited = rateLimit(req, bucket, perMinute);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  if (!supabaseConfigured()) return Response.json({ error: "linking_unavailable" }, { status: 503 });
  return user;
}

/** 500 without details (database errors can echo values). */
export function serverError(where: string, e: unknown): Response {
  console.error(`[${where}]`, e instanceof Error ? e.message.slice(0, 200) : "error");
  return Response.json({ error: "server_error" }, { status: 500 });
}

/** A JSON body of at most `maxBytes`, or null. */
export async function readJson<T>(req: Request, maxBytes = 16_384): Promise<T | null> {
  const raw = await readText(req, maxBytes);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
