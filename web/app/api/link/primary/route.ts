// POST { linkId } -> { ok: true }: choose the chat that receives reminders.
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { setPrimaryLink } from "@/lib/bots/links";

export async function POST(req: Request) {
  const user = await linkingUser(req, "link-primary", 20);
  if (user instanceof Response) return user;
  const body = await readJson<{ linkId?: unknown }>(req);
  const linkId = body?.linkId;
  if (typeof linkId !== "number" || !Number.isSafeInteger(linkId)) return Response.json({ error: "bad_link" }, { status: 400 });
  try {
    if (!(await setPrimaryLink(user.id, linkId))) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError("link/primary", e);
  }
}
