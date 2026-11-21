import { createHmac } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";

export interface SessionUser {
  /** Clerk user id, e.g. "user_2abc…" (a string, not a uuid). */
  id: string;
  email: string | null;
}

/**
 * The signed-in person, or null when there is no valid session (missing, expired, revoked).
 * Reads only the verified Clerk session token: no network call per request. `email` comes from
 * an `email` claim when the Clerk session token is customised to carry one, otherwise null.
 */
export async function requireUser(): Promise<SessionUser | null> {
  try {
    const { userId, sessionClaims } = await auth();
    if (!userId) return null;
    const email = sessionClaims?.email;
    return { id: userId, email: typeof email === "string" && email ? email : null };
  } catch (e) {
    // Next's own control-flow errors (a prerender ending while headers() waits) are not outages.
    unstable_rethrow(e);
    // Fail closed: an auth outage looks like "signed out", never like "signed in".
    console.error("requireUser:", e instanceof Error ? e.name : "error");
    return null;
  }
}

/** 401 for API routes when there is no session; the client sends the person to /login. */
export function signedOut(): Response {
  return Response.json({ error: "signed_out" }, { status: 401 });
}

// /opengraph-image has no file extension, so it is listed: share-card crawlers are never signed in.
const PUBLIC_PREFIXES = ["/login", "/privacy", "/terms", "/opengraph-image", "/api/bots", "/api/cron", "/_next"];

/** Paths anyone may open without signing in. "/" itself is public (signed-out visitors get the
 * landing page there); only the exact path, never as a prefix. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
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
    // Dot segments normalize away ("/..//evil" -> "//evil"), so check the result again.
    const out = `${u.pathname}${u.search}${u.hash}`;
    return out.startsWith("//") || out.startsWith("/\\") ? "/" : out;
  } catch {
    return "/";
  }
}

/**
 * Key that signs the Slack OAuth state cookie: SLACK_STATE_SECRET, or else a key derived from
 * CRON_SECRET, so the cron header secret is never itself used as a cookie-signing key. "" when
 * neither is set, and checkOAuthState then rejects every state (fails closed).
 */
export function slackStateSecret(): string {
  if (process.env.SLACK_STATE_SECRET) return process.env.SLACK_STATE_SECRET;
  const cron = process.env.CRON_SECRET;
  return cron ? createHmac("sha256", cron).update("aspire/slack-oauth-state").digest("base64url") : "";
}
