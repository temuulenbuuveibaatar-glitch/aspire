// Cloud sync for people who linked a bot or turned on reminder notifications (that is the consent).
// GET -> { state: UserState | null }; PUT { state } -> { state } (merged item by item with the
// stored copy, never overwritten). Both answer 409 { error: "not_linked" } without either.
// With notifications on but no bot, only reminders are kept: that is all the push sender needs.
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { listLinks } from "@/lib/bots/links";
import { loadCloudState, saveCloudState } from "@/lib/cloud";
import { hasPushSubscription } from "@/lib/push";
import { emptyState, parseState } from "@/lib/state";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Fits the largest state parseState keeps (lib/lists.ts MAX_TOTAL), so a full device still syncs. */
const MAX_BYTES = 1024 * 1024;
const notLinked = () => Response.json({ error: "not_linked" }, { status: 409 });
const noStore = { "Cache-Control": "no-store" };
/** Reminders reach a linked chat or a push-enabled device only through the cloud copy. "all" for a bot, which reads the rest too. */
const syncs = async (userId: string): Promise<"all" | "reminders" | null> =>
  (await listLinks(userId)).length > 0 ? "all" : (await hasPushSubscription(supabaseAdmin(), userId)) ? "reminders" : null;

export async function GET(req: Request) {
  const user = await linkingUser(req, "sync", 60);
  if (user instanceof Response) return user;
  try {
    if (!(await syncs(user.id))) return new Response(null, { status: 204 }); // nothing to sync: not an error
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
    const scope = await syncs(user.id);
    if (!scope) return notLinked();
    const kept = scope === "all" ? state : { ...emptyState(), reminders: state.reminders };
    return Response.json({ state: await saveCloudState(user.id, kept) }, { headers: noStore });
  } catch (e) {
    return serverError("sync", e);
  }
}
