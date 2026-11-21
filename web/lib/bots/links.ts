// Linking a chat account (Telegram, Discord, Slack) to an Aspire user with a one-time code.
// Server only. A code is 10 characters (the desktop code alphabet, about 49.5 bits: guessing stays
// hopeless across many chat accounts and server instances), works once, for 10 minutes; a new code
// replaces the user's older ones. One row per (platform, chat, user): a Telegram group a linked
// user runs /link in becomes a send target. The first link of a user is their primary chat (reminders go there).
import { deleteCloudData } from "@/lib/cloud";
import { DESKTOP_CODE_RE as CODE_RE, newDesktopCode, normalizeDesktopCode } from "@/lib/desktop";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BotPlatform, LinkTarget } from "./core";

export const CODE_TTL_MS = 10 * 60_000;

export interface BotLink {
  id: number;
  userId: string;
  platform: BotPlatform;
  platformUserId: string;
  chatId: string;
  chatTitle: string;
  teamId: string | null;
  isPrimary: boolean;
  linkedAt: string;
}

interface LinkRow {
  id: number;
  user_id: string;
  platform: BotPlatform;
  platform_user_id: string;
  chat_id: string;
  chat_title: string | null;
  team_id?: string | null;
  is_primary: boolean;
  linked_at: string;
}

const toLink = (r: LinkRow): BotLink => ({
  id: r.id,
  userId: r.user_id,
  platform: r.platform,
  platformUserId: r.platform_user_id,
  chatId: r.chat_id,
  chatTitle: r.chat_title ?? "",
  teamId: r.team_id ?? null,
  isPrimary: r.is_primary,
  linkedAt: r.linked_at,
});

function fail(what: string, error: { code?: string } | null): never {
  throw new Error(`links ${what} failed (${error?.code ?? "unknown"})`);
}

/** A fresh one-time code for this user (older codes of theirs stop working). */
export async function createLinkCode(userId: string, now = new Date()): Promise<string> {
  const db = supabaseAdmin();
  // Housekeeping: this user's old codes and anyone's expired ones.
  await db.from("link_codes").delete().eq("user_id", userId);
  await db.from("link_codes").delete().lt("expires_at", now.toISOString());
  const expires_at = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newDesktopCode();
    const { error } = await db.from("link_codes").insert({ code, user_id: userId, expires_at });
    if (!error) return code;
    if (error.code !== "23505") fail("code", error); // 23505 = someone else holds this code: try another
  }
  throw new Error("links code failed (no free code)");
}

/**
 * Redeem a code from a chat: the code is deleted (so it works once) and the chat is linked.
 * Null when the code is unknown or expired.
 */
export async function redeemLinkCode(code: string, link: LinkTarget, now = new Date()): Promise<{ userId: string } | null> {
  const clean = normalizeDesktopCode(code);
  if (!CODE_RE.test(clean) || !link.platformUserId || !link.chatId) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.from("link_codes").delete().eq("code", clean).select("user_id, expires_at");
  if (error) fail("redeem", error);
  const row = (data as { user_id: string; expires_at: string }[] | null)?.[0];
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;
  const userId = row.user_id;

  // One chat account belongs to one Aspire user: drop links of this account to anyone else.
  const { data: others } = await db
    .from("bot_links")
    .delete()
    .eq("platform", link.platform)
    .eq("platform_user_id", link.platformUserId)
    .neq("user_id", userId)
    .select("user_id");
  for (const other of new Set(((others ?? []) as { user_id: string }[]).map((o) => o.user_id))) {
    if (!(await listLinks(other)).length) await deleteCloudData(other);
  }

  const existing = await listLinks(userId);
  const already = existing.find((l) => l.platform === link.platform && l.chatId === link.chatId);
  const { error: e } = await db.from("bot_links").upsert(
    {
      user_id: userId,
      platform: link.platform,
      platform_user_id: link.platformUserId,
      chat_id: link.chatId,
      chat_title: link.chatTitle.slice(0, 120) || null,
      team_id: link.teamId ?? null,
      is_primary: already ? already.isPrimary : existing.length === 0,
      linked_at: now.toISOString(),
    },
    { onConflict: "platform,chat_id,user_id" },
  );
  if (e) fail("link", e);
  return { userId };
}

/** The Aspire user a chat account is linked to, or null. */
export async function findLinkedUser(platform: BotPlatform, platformUserId: string): Promise<string | null> {
  if (!platformUserId) return null;
  const { data, error } = await supabaseAdmin()
    .from("bot_links")
    .select("user_id")
    .eq("platform", platform)
    .eq("platform_user_id", platformUserId)
    .limit(1);
  if (error) fail("lookup", error);
  return ((data ?? []) as { user_id: string }[])[0]?.user_id ?? null;
}

export async function listLinks(userId: string): Promise<BotLink[]> {
  const { data, error } = await supabaseAdmin().from("bot_links").select("*").eq("user_id", userId).order("linked_at", { ascending: true });
  if (error) fail("list", error);
  return ((data ?? []) as LinkRow[]).map(toLink);
}

/** Where reminders go: the primary link, else the oldest one. */
export async function primaryLink(userId: string): Promise<BotLink | null> {
  const links = await listLinks(userId);
  return links.find((l) => l.isPrimary) ?? links[0] ?? null;
}

export async function setPrimaryLink(userId: string, linkId: number): Promise<boolean> {
  const links = await listLinks(userId);
  if (!links.some((l) => l.id === linkId)) return false;
  const db = supabaseAdmin();
  const { error } = await db.from("bot_links").update({ is_primary: false }).eq("user_id", userId);
  if (error) fail("primary", error);
  const { error: e } = await db.from("bot_links").update({ is_primary: true }).eq("user_id", userId).eq("id", linkId);
  if (e) fail("primary", e);
  return true;
}

/**
 * Remove one of the user's links. When none remain, all cloud data is deleted (sync is off).
 * Returns null when the link is not theirs, else how many links remain.
 */
export async function removeLink(userId: string, linkId: number): Promise<number | null> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("bot_links").delete().eq("user_id", userId).eq("id", linkId).select("id, is_primary");
  if (error) fail("unlink", error);
  const removed = ((data ?? []) as { is_primary: boolean }[])[0];
  if (!removed) return null;
  const rest = await listLinks(userId);
  if (!rest.length) {
    await deleteCloudData(userId);
    return 0;
  }
  if (removed.is_primary && !rest.some((l) => l.isPrimary)) await setPrimaryLink(userId, rest[0].id);
  return rest.length;
}

/** The user's Telegram chats the web app may send to: `{ chatId, title }`. */
export async function telegramTargets(userId: string): Promise<{ chatId: string; title: string }[]> {
  return (await listLinks(userId))
    .filter((l) => l.platform === "telegram")
    .map((l) => ({ chatId: l.chatId, title: l.chatTitle || "Telegram" }));
}
