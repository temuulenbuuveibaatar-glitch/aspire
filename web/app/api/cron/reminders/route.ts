// POST (header x-cron-secret = CRON_SECRET) -> { sent, failed }
// Called every minute by Supabase pg_cron + pg_net. Delivers due bot_reminders to each person's
// phones and browsers with reminder notifications on (Web Push, lib/push.ts) and to their
// primary linked chat (Telegram chat, Discord DM, Slack DM), moves daily ones to tomorrow,
// and mirrors the change into user_state so the phone stops showing them as pending.
// Each reminder is claimed with a conditional update first, so overlapping runs never send twice.
// Fair share: each person gets at most PER_USER reminders a run, everyone's first one before anyone's
// second, so one account's failing reminders cannot crowd out other people's.
import { safeEqual } from "@/lib/bots/secure";
import { deliverToLink } from "@/lib/bots/deliver";
import { primaryLink, type BotLink } from "@/lib/bots/links";
import { botText } from "@/lib/bots/text";
import { markReminderFired, supabaseConfigured } from "@/lib/cloud";
import { detectTextLanguage } from "@/lib/lang";
import { deliverPush } from "@/lib/push";
import { nextDaily } from "@/lib/state";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 60;

const BATCH = 100;
/** Due rows read per run: more than one person can hold (100), so others are always seen. */
const SCAN = 1000;
const PER_USER = 5;
/** Stop claiming new reminders after this long; the rest wait for the next minute (maxDuration 60 s). */
const DEADLINE_MS = 45_000;
/** A failed delivery is retried next minute while the reminder is less than an hour late. */
const RETRY_WINDOW_MS = 60 * 60_000;

interface Row {
  id: string;
  user_id: string;
  text: string;
  at: string;
  repeat_daily: boolean;
  sent_at: string | null;
}

const log = (what: string, e: unknown) =>
  console.error(`[cron:reminders] ${what}:`, e instanceof Error ? e.message.slice(0, 200) : "unknown");

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!supabaseConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });

  const now = new Date();
  const nowIso = now.toISOString();
  const db = supabaseAdmin();
  const { data, error } = await db.from("bot_reminders").select("*").lte("at", nowIso).order("at", { ascending: true }).limit(SCAN);
  if (error) {
    log("select", new Error(error.code ?? "db error"));
    return Response.json({ error: "server_error" }, { status: 500 });
  }

  const seen = new Map<string, number>();
  const due = ((data ?? []) as Row[])
    .filter((r) => r.repeat_daily || !r.sent_at)
    .map((r) => {
      const rank = seen.get(r.user_id) ?? 0;
      seen.set(r.user_id, rank + 1);
      return { r, rank };
    })
    .filter((x) => x.rank < PER_USER)
    .sort((a, b) => a.rank - b.rank) // stable: oldest first within a round
    .slice(0, BATCH)
    .map((x) => x.r);
  const started = performance.now();
  const links = new Map<string, BotLink | null>();
  let sent = 0;
  let failed = 0;

  for (const r of due) {
    if (performance.now() - started > DEADLINE_MS) break;
    const nextAt = r.repeat_daily ? nextDaily(r.at, now) : null;
    // Claim: only the run that flips the row may send it.
    const claim = nextAt
      ? db.from("bot_reminders").update({ at: nextAt, sent_at: nowIso }).eq("id", r.id).eq("at", r.at)
      : db.from("bot_reminders").update({ sent_at: nowIso }).eq("id", r.id).is("sent_at", null);
    const { data: claimed, error: claimError } = await claim.select("id");
    if (claimError || !(claimed as unknown[] | null)?.length) continue;

    const reminderId = r.id.startsWith(`${r.user_id}:`) ? r.id.slice(r.user_id.length + 1) : r.id;
    // Delivered when at least one device took the push or the linked chat got it.
    const pushed = await deliverPush(db, r.user_id, { id: reminderId, text: r.text }).catch((e) => (log("push", e), 0));
    let chatOk = false;
    try {
      if (!links.has(r.user_id)) links.set(r.user_id, await primaryLink(r.user_id));
      const link = links.get(r.user_id);
      if (link) {
        await deliverToLink(link, `${botText(detectTextLanguage(r.text)).reminder}: ${r.text}`);
        chatOk = true;
      }
    } catch (e) {
      log("deliver", e);
    }
    if (pushed > 0 || chatOk) sent++;
    else {
      failed++;
      if (now.getTime() - Date.parse(r.at) < RETRY_WINDOW_MS) {
        // Give the claim back so the next run tries again.
        await db.from("bot_reminders").update({ at: r.at, sent_at: r.sent_at }).eq("id", r.id);
        continue;
      }
    }
    await markReminderFired(r.user_id, reminderId, nextAt, now, db).catch((e) => log("mirror", e));
  }

  return Response.json({ sent, failed });
}
