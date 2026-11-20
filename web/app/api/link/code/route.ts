// POST { consent: true } -> { code, expiresAt }: a one-time 6-digit code (10 minutes) to link a
// Telegram/Discord/Slack chat. Ticking the consent box (cloud sync for the bot) is required.
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { CODE_TTL_MS, createLinkCode } from "@/lib/bots/links";

export async function POST(req: Request) {
  const user = await linkingUser(req, "link-code", 10);
  if (user instanceof Response) return user;
  const body = await readJson<{ consent?: unknown }>(req);
  if (body?.consent !== true) return Response.json({ error: "consent_required" }, { status: 400 });
  try {
    const now = new Date();
    const code = await createLinkCode(user.id, now);
    return Response.json(
      { code, expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return serverError("link/code", e);
  }
}
