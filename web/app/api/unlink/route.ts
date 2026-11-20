// POST { linkId } -> { ok, remaining }: unlink one chat; when none remain, all cloud data is
// deleted. POST { all: true } -> { ok, remaining: 0 }: "Delete my cloud data" (unlinks everything).
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { removeLink } from "@/lib/bots/links";
import { deleteCloudData } from "@/lib/cloud";

export async function POST(req: Request) {
  const user = await linkingUser(req, "unlink", 20);
  if (user instanceof Response) return user;
  const body = await readJson<{ linkId?: unknown; all?: unknown }>(req);
  try {
    if (body?.all === true) {
      await deleteCloudData(user.id);
      return Response.json({ ok: true, remaining: 0 });
    }
    const linkId = body?.linkId;
    if (typeof linkId !== "number" || !Number.isSafeInteger(linkId)) return Response.json({ error: "bad_link" }, { status: 400 });
    const remaining = await removeLink(user.id, linkId);
    if (remaining === null) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true, remaining });
  } catch (e) {
    return serverError("unlink", e);
  }
}
