// Shared bot core: every platform (Telegram, Discord, Slack) turns a chat message
// into an answer here, using the same brain as the web app.
//
// Today only the unlinked path exists (no Supabase yet): smart chat with no
// personal memory. Cloud linking (Task 12) plugs in at the two marked extension
// points below: `loadLinkedUser` and `redeemLinkCode`.
import { ask, type Turn } from "@/lib/brain";
import { fallbackLine } from "@/lib/brain/shared";
import { detectTextLanguage, type Lang } from "@/lib/lang";
import type { ClientAction } from "@/lib/tools";
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
}

export interface LinkedUser {
  userId: string;
}

// ---------------------------------------------------------------------------
// EXTENSION POINT (Task 12, cloud linking): look the sender up in `bot_links`
// (platform, platform_user_id). Return null while Supabase is not set up.
export async function loadLinkedUser(platform: BotPlatform, platformUserId: string): Promise<LinkedUser | null> {
  void platform;
  void platformUserId;
  return null;
}

// EXTENSION POINT (Task 12): redeem a 6-digit code from Settings → Connections,
// insert the `bot_links` row and delete the code. Null = invalid/expired code
// (and, for now, "linking isn't available yet").
export async function redeemLinkCode(code: string, link: LinkTarget): Promise<LinkedUser | null> {
  void code;
  void link;
  return null;
}
// ---------------------------------------------------------------------------

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

/** Actions the web app would show as cards become plain text lines in chat. */
function renderActions(actions: ClientAction[], lang: Lang): string[] {
  const lines: string[] = [];
  for (const a of actions) {
    if (a.type === "call") lines.push(`${botText(lang).call} ${a.label}: ${a.number}`.replace(/\s+:/, ":"));
  }
  return lines;
}

const MAX_INPUT = 2000;

export async function handleBotMessage(input: BotMessage): Promise<BotReply> {
  const text = input.text.trim().slice(0, MAX_INPUT);
  const lang = input.lang ?? detectTextLanguage(text);

  const linkedUser = await loadLinkedUser(input.platform, input.platformUserId);
  // EXTENSION POINT (Task 12): when `linkedUser` is set, load cloud state, run
  // ask() with toDevice(state) and apply the returned actions to the cloud.
  const linked = linkedUser !== null;

  const history = historyFor(input.platform, input.chatId);
  try {
    const result = await ask(text, lang, history);
    const extra = renderActions(result.actions, lang);
    const reply = [result.reply.trim(), ...(extra.length ? [extra.join("\n")] : [])].filter(Boolean).join("\n\n");
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
