// Proactive messages from the bot to a linked person (reminders): Telegram to the linked chat,
// Discord and Slack as a direct message. Server only; tokens never appear in errors.
import { DISCORD_API, DISCORD_MAX_TEXT } from "./discord";
import type { BotLink } from "./links";
import { getSlackToken, slackApi, slackPost } from "./slack";
import { splitText } from "./split";
import { sendTelegram } from "./telegram";

async function discordApi<T>(path: string, body: object): Promise<T> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");
  const res = await fetch(`${DISCORD_API}${path}`, {
    redirect: "error",
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error("Discord API: network error");
  });
  if (!res.ok) throw new Error(`Discord API failed (${res.status})`);
  return (await res.json()) as T;
}

/** DM a Discord user: open (or reuse) the DM channel, then post. */
export async function discordDm(discordUserId: string, text: string): Promise<void> {
  const channel = await discordApi<{ id: string }>("/users/@me/channels", { recipient_id: discordUserId });
  for (const content of splitText(text, DISCORD_MAX_TEXT)) {
    await discordApi(`/channels/${encodeURIComponent(channel.id)}/messages`, { content, allowed_mentions: { parse: [] } });
  }
}

/** DM a Slack user with the bot token of their workspace. */
export async function slackDm(teamId: string, slackUserId: string, text: string): Promise<void> {
  const token = await getSlackToken(teamId);
  if (!token) throw new Error("Slack: no installation for this workspace");
  const { channel } = await slackApi<{ ok: boolean; channel?: { id?: string } }>(token, "conversations.open", { users: slackUserId });
  if (!channel?.id) throw new Error("Slack conversations.open: no channel");
  await slackPost(token, channel.id, text);
}

/** Send `text` to a linked chat (Telegram) or to the person directly (Discord, Slack). */
export async function deliverToLink(link: BotLink, text: string): Promise<void> {
  if (link.platform === "telegram") return sendTelegram(link.chatId, text);
  if (link.platform === "discord") return discordDm(link.platformUserId, text);
  return slackDm(link.teamId ?? "", link.platformUserId, text);
}
