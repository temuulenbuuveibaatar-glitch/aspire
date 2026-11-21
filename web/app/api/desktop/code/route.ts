// POST -> { code, expiresAt }: a one-time 10-character code (10 minutes) to pair Aspire Desktop.
import { linkingUser, serverError } from "@/lib/bots/guard";
import { createDesktopCode, DESKTOP_CODE_TTL_MS } from "@/lib/desktop";

export async function POST(req: Request) {
  const user = await linkingUser(req, "desktop-code", 10);
  if (user instanceof Response) return user;
  try {
    const now = new Date();
    const code = await createDesktopCode(user.id, now);
    return Response.json(
      { code, expiresAt: new Date(now.getTime() + DESKTOP_CODE_TTL_MS).toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return serverError("desktop/code", e);
  }
}
