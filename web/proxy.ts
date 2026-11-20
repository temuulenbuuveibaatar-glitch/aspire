import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isPublicPath } from "@/lib/auth";

// Runs before every matched request. Clerk verifies (and in development, hands off) the session;
// people who are not signed in are sent to /login?next=<path>. API paths are never redirected:
// guarded routes answer 401 themselves via requireUser(). Public paths come from isPublicPath()
// (/login…, /privacy, /terms, /api/bots/…, /api/cron/…, static files), the same list the tests pin.
export default clerkMiddleware(async (auth, request) => {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/") || isPublicPath(pathname)) return;

  const { userId } = await auth();
  if (userId) return;

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)"],
};
