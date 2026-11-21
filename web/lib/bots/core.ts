// Shared bot core: every platform (Telegram, Discord, Slack) turns a chat message
// into an answer here, using the same brain as the web app.
//
// Linked chat accounts (bot_links) answer as the person: their cloud state is the device
// context, their Gmail is available, and remember/forget/routine/lesson/reminder actions are
// written back to the cloud copy (reminders also to bot_reminders). Card actions (call,
// message, calendar) become plain text lines with links. Unlinked accounts get smart chat with
// no memory and a one-time hint about linking.
import { ask, type Turn } from "@/lib/brain";
import { fallbackLine } from "@/lib/brain/shared";
import { applyCloudActions, loadCloudState, supabaseConfigured } from "@/lib/cloud";
import { googleAccessToken } from "@/lib/google-token";
import { detectTextLanguage, type Lang } from "@/lib/lang";
import { gmailComposeUrl, isGoogleMapsUrl, smsUrl, telegramShareUrl } from "@/lib/links";
import { emptyState, toDevice } from "@/lib/state";
import type { ClientAction } from "@/lib/tools";
import { validTimeZone, zoneOr } from "@/lib/tools/time";
import type { Channel } from "@/lib/tools/types";
import { findLinkedUser, listLinks, redeemLinkCode as redeemCode } from "./links";
import { botText } from "./text";

export type BotPlatform = "telegram" | "discord" | "slack";

export interface BotMessage {
  platform: BotPlatform;
  platformUserId: string;
  chatId: string;
  text: string;
  /** Known language (e.g. detected from a voice note); otherwise detected from the text. */
  lang?: Lang;
}

export interface BotReply {
  text: string;
  lang: Lang;
  linked: boolean;
}

export interface LinkTarget {
  platform: BotPlatform;
  platformUserId: string;
  chatId: string;
  chatTitle: string;
  /** Slack workspace id (needed to DM the person later, e.g. for reminders). */
  teamId?: string;
}

export interface LinkedUser {
  userId: string;
}

const logError = (what: string, e: unknown) =>
  console.error(`[bot] ${what} failed:`, e instanceof Error ? e.message.slice(0, 200) : "unknown");

/** The Aspire user this chat account is linked to (bot_links), or null. Never throws. */
export async function loadLinkedUser(platform: BotPlatform, platformUserId: string): Promise<LinkedUser | null> {
  if (!supabaseConfigured()) return null;
  try {
    const userId = await findLinkedUser(platform, platformUserId);
    return userId ? { userId } : null;
  } catch (e) {
    logError("link lookup", e);
    return null;
  }
}

/** Redeem a 6-digit code from Settings, Connections. Null = invalid/expired code or linking unavailable. */
export async function redeemLinkCode(code: string, link: LinkTarget): Promise<LinkedUser | null> {
  if (!supabaseConfigured()) return null;
  return redeemCode(code, link);
}

// In-memory per-chat history (per server instance) so a thread keeps context.
export const MAX_TURNS = 8;
export const MAX_CHATS = 500;
const histories = new Map<string, Turn[]>();
const historyKey = (platform: BotPlatform, chatId: string) => `${platform}:${chatId}`;

/** Read a chat's history (most recent last). Touching it marks the chat as recently used. */
export function historyFor(platform: BotPlatform, chatId: string): Turn[] {
  const key = historyKey(platform, chatId);
  const turns = histories.get(key);
  if (!turns) return [];
  histories.delete(key); // Map keeps insertion order: re-insert = most recently used
  histories.set(key, turns);
  return [...turns];
}

function remember(platform: BotPlatform, chatId: string, turns: Turn[]) {
  const key = historyKey(platform, chatId);
  histories.delete(key);
  histories.set(key, turns.slice(-MAX_TURNS));
  while (histories.size > MAX_CHATS) histories.delete(histories.keys().next().value!);
}

const LOCALE: Record<Lang, string> = { mn: "mn-MN", zh: "zh-CN", en: "en-GB", ru: "ru-RU", de: "de-DE" };
const CHANNEL_NAME: Record<Channel, string> = { telegram: "Telegram", discord: "Discord", slack: "Slack", sms: "SMS", email: "Email" };

/**
 * Chats carry no time zone, so bots use BOT_TIME_ZONE (IANA, optional) for reminders and events.
 * Without it times are UTC and the model asks the person for their city first.
 */
export const botTimeZone = (): string | undefined => validTimeZone(process.env.BOT_TIME_ZONE) ?? undefined;

function when(iso: string, lang: Lang, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const zone = zoneOr(timeZone);
  const text = d.toLocaleString(LOCALE[lang], { timeZone: zone, dateStyle: "medium", timeStyle: "short" });
  return zone === "UTC" ? `${text} UTC` : text;
}

/** Actions the web app would show as cards become plain text lines in chat (nothing is sent). */
export function renderActions(actions: ClientAction[], lang: Lang, timeZone = botTimeZone()): string[] {
  const t = botText(lang);
  const lines: string[] = [];
  for (const a of actions) {
    if (a.type === "call") lines.push(`${t.call} ${a.label}: ${a.number}`.replace(/\s+:/, ":"));
    if (a.type === "message") {
      const head = `${t.message} (${CHANNEL_NAME[a.channel]}${a.to ? `: ${a.to}` : ""}): ${a.subject ? `${a.subject} — ` : ""}${a.text}`;
      const link =
        a.channel === "email"
          ? gmailComposeUrl(a.to, a.subject, a.text)
          : a.channel === "sms"
            ? smsUrl(a.to, a.text)
            : a.channel === "telegram"
              ? telegramShareUrl(a.text)
              : t.openApp;
      lines.push(`${head}\n${link}`);
    }
    if (a.type === "calendar") lines.push(`${t.calendar}: ${a.title}, ${when(a.start, lang, timeZone)}\n${a.url}`);
    if (a.type === "map" && isGoogleMapsUrl(a.url)) lines.push(`Google Maps: ${a.title}\n${a.url}`);
    // "Open <app>" has no button in a chat: give the allow-listed web version when there is one.
    if (a.type === "open_app" && /^https:\/\//.test(a.web)) lines.push(`${a.name}: ${a.web}`);
    // Task cards ("On it"): the chat gets the code or the form itself. 3500 keeps each under Telegram's 4096 limit.
    if (a.type === "code") lines.push(`${a.title} (${a.language}):\n${a.code}`.slice(0, 3500));
    if (a.type === "form") lines.push([a.title, ...a.fields.map((f) => `${f.label}: ${f.value || "-"}`)].join("\n").slice(0, 3500));
  }
  return lines;
}

const MAX_INPUT = 2000;

export async function handleBotMessage(input: BotMessage): Promise<BotReply> {
  const text = input.text.trim().slice(0, MAX_INPUT);
  const lang = input.lang ?? detectTextLanguage(text);
  const now = new Date();

  const linkedUser = await loadLinkedUser(input.platform, input.platformUserId);
  const linked = linkedUser !== null;

  const history = historyFor(input.platform, input.chatId);
  const timeZone = botTimeZone();
  const where = timeZone ? { timeZone } : {};
  try {
    let result;
    if (linkedUser) {
      const { userId } = linkedUser;
      const [state, links] = await Promise.all([
        loadCloudState(userId).catch((e) => (logError("cloud load", e), null)),
        listLinks(userId).catch(() => []),
      ]);
      const cloud = state ?? emptyState();
      const connected = [...new Set(links.map((l) => l.platform))] as Channel[];
      result = await ask(text, lang, history, { ...toDevice(cloud), connected }, now, {
        gmailToken: () => googleAccessToken(userId),
        ...where,
        userId,
        // Tools word their notes for a chat (no camera panel here); desktop tools stay web-only.
        source: "bot",
      });
      // The answer still goes out if saving fails; the person can repeat the request.
      await applyCloudActions(userId, cloud, result.actions, now).catch((e) => logError("cloud save", e));
    } else {
      result = await ask(text, lang, history, undefined, now, { ...where, source: "bot" });
    }
    const extra = renderActions(result.actions, lang, timeZone);
    // Unlinked: point at linking once per chat (only when linking is available at all).
    const hint = !linked && supabaseConfigured() && history.length === 0 ? botText(lang).linkHint : "";
    const reply = [result.reply.trim(), ...(extra.length ? [extra.join("\n")] : []), hint].filter(Boolean).join("\n\n");
    remember(input.platform, input.chatId, [
      ...history,
      { role: "user", text },
      { role: "assistant", text: result.reply },
    ]);
    return { text: reply || fallbackLine(lang), lang, linked };
  } catch (e) {
    console.error(`[bot:${input.platform}] answer failed`, e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return { text: fallbackLine(lang), lang, linked };
  }
}
