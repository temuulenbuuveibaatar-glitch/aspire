// Cloud sync for people who linked a bot (linking is the consent).
// GET -> { state: UserState | null }; PUT { state } -> { state } (merged item by item with the
// stored copy, never overwritten). Both answer 409 { error: "not_linked" } without a bot link.
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { listLinks } from "@/lib/bots/links";
import { loadCloudState, saveCloudState } from "@/lib/cloud";
import { parseState } from "@/lib/state";

const MAX_BYTES = 512 * 1024;
const notLinked = () => Response.json({ error: "not_linked" }, { status: 409 });
const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const user = await linkingUser(req, "sync", 60);
  if (user instanceof Response) return user;
  try {
    if (!(await listLinks(user.id)).length) return notLinked();
    return Response.json({ state: await loadCloudState(user.id) }, { headers: noStore });
  } catch (e) {
    return serverError("sync", e);
  }
}

export async function PUT(req: Request) {
  const user = await linkingUser(req, "sync", 60);
  if (user instanceof Response) return user;
  const body = await readJson<{ state?: unknown }>(req, MAX_BYTES);
  const state = parseState(body?.state);
  if (!state) return Response.json({ error: "bad_state" }, { status: 400 });
  try {
    if (!(await listLinks(user.id)).length) return notLinked();
    return Response.json({ state: await saveCloudState(user.id, state) }, { headers: noStore });
  } catch (e) {
    return serverError("sync", e);
  }
}
