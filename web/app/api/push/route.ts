// POST   { subscription, lang?, hideText? } -> { ok }: notifications on for this browser.
// DELETE { endpoint } -> { ok }: off (idempotent: a replay or someone else's endpoint changes nothing).
// The owner is always the session's user, never a body field. Endpoints only on the browser push
// services (lib/push.ts), at most MAX_SUBSCRIPTIONS per person (the oldest go first).
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { isLang } from "@/lib/lang";
import { MAX_SUBSCRIPTIONS, parseSubscription, pushConfigured, pushEndpoint } from "@/lib/push";
import { rateLimitKey } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";

const TABLE = "push_subscriptions";
const noStore = { "Cache-Control": "no-store" };

async function who(req: Request) {
  const user = await linkingUser(req, "push", 20);
  if (user instanceof Response) return user;
  return rateLimitKey(`push:${user.id}`, 10) ?? user;
}

export async function POST(req: Request) {
  const user = await who(req);
  if (user instanceof Response) return user;
  if (!pushConfigured()) return Response.json({ error: "push_unavailable" }, { status: 503 });
  const body = await readJson<{ subscription?: unknown; lang?: unknown; hideText?: unknown }>(req, 4096);
  const sub = parseSubscription(body?.subscription);
  if (!sub) return Response.json({ error: "bad_subscription" }, { status: 400 });
  try {
    const db = supabaseAdmin();
    const row = { ...sub, user_id: user.id, lang: isLang(body?.lang) ? body.lang : "en", hide_text: body?.hideText === true, created_at: new Date().toISOString() };
    const { error } = await db.from(TABLE).upsert(row, { onConflict: "endpoint" });
    if (error) throw new Error(`push upsert ${error.code ?? ""}`);
    const { data } = await db.from(TABLE).select("endpoint").eq("user_id", user.id).order("created_at", { ascending: false });
    const extra = ((data ?? []) as { endpoint: string }[]).slice(MAX_SUBSCRIPTIONS).map((r) => r.endpoint);
    if (extra.length) await db.from(TABLE).delete().eq("user_id", user.id).in("endpoint", extra);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return serverError("push", e);
  }
}

export async function DELETE(req: Request) {
  const user = await who(req);
  if (user instanceof Response) return user;
  const body = await readJson<{ endpoint?: unknown }>(req, 2048);
  const endpoint = pushEndpoint(body?.endpoint);
  if (!endpoint) return Response.json({ error: "bad_endpoint" }, { status: 400 });
  try {
    const { error } = await supabaseAdmin().from(TABLE).delete().eq("user_id", user.id).eq("endpoint", endpoint);
    if (error) throw new Error(`push delete ${error.code ?? ""}`);
    return Response.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return serverError("push", e);
  }
}
