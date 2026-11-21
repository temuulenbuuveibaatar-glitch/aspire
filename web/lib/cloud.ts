// Cloud copy of a person's state, kept only while they have at least one linked bot (linking is
// the consent). Server only: every query goes through the service-role client. The cloud copy
// never holds device-only secrets (Gmail refresh token, webhook URLs).
import { supabaseAdmin } from "@/lib/supabase/server";
import { applyActions, emptyState, mergeState, parseState, stripLocalOnly, type UserState } from "@/lib/state";
import type { ClientAction } from "@/lib/tools/types";

type Db = ReturnType<typeof supabaseAdmin>;

/** True when the database is configured (linking, sync and cloud reminders are available). */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function fail(what: string, error: { code?: string; message?: string } | null): never {
  // Database messages can echo values; log only the code.
  throw new Error(`cloud ${what} failed (${error?.code ?? "unknown"})`);
}

/** bot_reminders.id is global, so each row id is namespaced by its owner. */
export const reminderRowId = (userId: string, reminderId: string) => `${userId}:${reminderId}`;

export async function loadCloudState(userId: string, db: Db = supabaseAdmin()): Promise<UserState | null> {
  const { data, error } = await db.from("user_state").select("state").eq("user_id", userId).maybeSingle();
  if (error) fail("load", error);
  return data ? parseState((data as { state: unknown }).state) : null;
}

interface ReminderRow {
  id: string;
  text: string;
  at: string;
  repeat_daily: boolean;
}

/** Make `bot_reminders` match the live reminders in the state (one row per reminder, never duplicated). */
async function syncBotReminders(db: Db, userId: string, state: UserState): Promise<void> {
  const { data, error } = await db.from("bot_reminders").select("id, text, at, repeat_daily").eq("user_id", userId);
  if (error) fail("reminders read", error);
  const rows = (data ?? []) as ReminderRow[];
  const live = new Map(state.reminders.filter((r) => !r.deleted).map((r) => [reminderRowId(userId, r.id), r]));

  const stale = rows.filter((r) => !live.has(r.id)).map((r) => r.id);
  if (stale.length) {
    const { error: e } = await db.from("bot_reminders").delete().eq("user_id", userId).in("id", stale);
    if (e) fail("reminders delete", e);
  }
  const changed = [...live.entries()]
    .filter(([id, r]) => {
      const row = rows.find((x) => x.id === id);
      return !row || row.text !== r.text || row.repeat_daily !== r.repeatDaily || Date.parse(row.at) !== Date.parse(r.at);
    })
    .map(([id, r]) => ({ id, user_id: userId, text: r.text, at: r.at, repeat_daily: r.repeatDaily, sent_at: null }));
  if (changed.length) {
    const { error: e } = await db.from("bot_reminders").upsert(changed, { onConflict: "id" });
    if (e) fail("reminders write", e);
  }
}

/**
 * Merge `state` into the stored copy (never a whole-document overwrite), strip device-only
 * secrets, write it, and bring `bot_reminders` in line. Returns the merged copy.
 */
export async function saveCloudState(userId: string, state: UserState, now = new Date(), db: Db = supabaseAdmin()): Promise<UserState> {
  const stored = await loadCloudState(userId, db);
  const merged = stripLocalOnly(mergeState(stored ?? emptyState(), stripLocalOnly(state), now));
  const { error } = await db
    .from("user_state")
    .upsert({ user_id: userId, state: merged, updated_at: now.toISOString() }, { onConflict: "user_id" });
  if (error) fail("save", error);
  await syncBotReminders(db, userId, merged);
  return merged;
}

/** Apply assistant actions (remember, forget, routine, lesson, reminder…) to the cloud copy. */
export async function applyCloudActions(
  userId: string,
  state: UserState,
  actions: ClientAction[],
  now = new Date(),
  db: Db = supabaseAdmin(),
): Promise<UserState> {
  const next = applyActions(state, actions, now);
  return next === state ? state : saveCloudState(userId, next, now, db);
}

/**
 * Mirror a delivered reminder into the cloud state so every device stops showing it as pending:
 * a one-off becomes a tombstone, a daily one moves to `nextAt`.
 */
export async function markReminderFired(
  userId: string,
  reminderId: string,
  nextAt: string | null,
  now = new Date(),
  db: Db = supabaseAdmin(),
): Promise<void> {
  const state = await loadCloudState(userId, db);
  if (!state?.reminders.some((r) => r.id === reminderId && !r.deleted)) return;
  const when = now.toISOString();
  const reminders = state.reminders.map((r) =>
    r.id !== reminderId ? r : nextAt ? { ...r, at: nextAt, updatedAt: when } : { ...r, deleted: true, updatedAt: when },
  );
  await saveCloudState(userId, { ...state, reminders }, now, db);
}

/**
 * Everything the cloud holds for a person: paired computers (jobs, codes, devices), state, secrets,
 * reminders, links and pending codes. Jobs go before devices (the FK cascades anyway).
 * Needs supabase/migrations/20261121100000_desktop.sql applied (else 42P01 on the desktop tables).
 */
export async function deleteCloudData(userId: string, db: Db = supabaseAdmin()): Promise<void> {
  for (const table of ["desktop_jobs", "desktop_codes", "desktop_devices", "user_state", "secrets", "bot_reminders", "bot_links", "link_codes"]) {
    const { error } = await db.from(table).delete().eq("user_id", userId);
    if (error) fail(`delete ${table}`, error);
  }
}
