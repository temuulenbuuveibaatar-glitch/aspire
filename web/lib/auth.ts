import { supabaseServer } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The signed-in person, or null when there is no valid session (missing, expired, revoked). */
export async function requireUser(): Promise<SessionUser | null> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch (e) {
    // Fail closed: an auth outage looks like "signed out", never like "signed in".
    console.error("requireUser:", e instanceof Error ? e.name : "error");
    return null;
  }
}

/** 401 for API routes when there is no session; the client sends the person to /login. */
export function signedOut(): Response {
  return Response.json({ error: "signed_out" }, { status: 401 });
}

const PUBLIC_PREFIXES = ["/login", "/auth", "/privacy", "/terms", "/api/bots", "/api/cron", "/_next"];

/** Paths anyone may open without signing in. */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Static files (favicon.ico, robots.txt, images in public/).
  return /\/[^/]+\.[a-z0-9]+$/i.test(pathname);
}

/** Where to go after signing in: only same-origin relative paths; anything else becomes "/". */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  // Backslashes and control characters can turn into "//host" in some browsers.
  if (/[\\\u0000-\u001f]/.test(next)) return "/";
  try {
    const base = "http://same.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
