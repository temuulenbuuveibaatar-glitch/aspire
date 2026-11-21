// Discord interactions endpoint: /aspire ask question:<text> and /aspire link code:<code>.
// Discord needs an answer within 3 s, so commands are deferred (type 5) and the
// real reply is written into the original message from after().
import { after } from "next/server";
import { readText, WEBHOOK_MAX_BYTES } from "@/lib/body";
import { fallbackLine } from "@/lib/brain/shared";
import { handleBotMessage, redeemLinkCode } from "@/lib/bots/core";
import { discordReply, EPHEMERAL, verifyDiscord } from "@/lib/bots/discord";
import { botText, langFromLocale } from "@/lib/bots/text";
import { detectTextLanguage } from "@/lib/lang";
import { linkTryAllowed, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;

interface DiscordUser {
  id: string;
}
interface CommandOption {
  name: string;
  type: number;
  value?: unknown;
  options?: CommandOption[];
}
interface Interaction {
  type: number;
  token: string;
  application_id: string;
  channel_id?: string;
  channel?: { id: string; name?: string };
  member?: { user?: DiscordUser };
  user?: DiscordUser;
  locale?: string;
  data?: { name?: string; options?: CommandOption[] };
}

const optionText = (sub: CommandOption, name: string) => {
  const v = sub.options?.find((o) => o.name === name)?.value;
  return typeof v === "string" ? v.trim() : "";
};

const log = (what: string, e: unknown) =>
  console.error(`[bot:discord] ${what} failed:`, e instanceof Error ? e.message.slice(0, 200) : "unknown");

export async function POST(req: Request) {
  const limited = rateLimit(req, "bot-discord", 300);
  if (limited) return limited;
  const raw = await readText(req, WEBHOOK_MAX_BYTES);
  if (raw === null) return new Response("invalid request signature", { status: 401 });
  const publicKey = process.env.DISCORD_PUBLIC_KEY ?? "";
  const ok =
    !!publicKey &&
    (await verifyDiscord(
      req.headers.get("x-signature-ed25519") ?? "",
      req.headers.get("x-signature-timestamp") ?? "",
      raw,
      publicKey,
    ));
  if (!ok) return new Response("invalid request signature", { status: 401 });

  let i: Interaction;
  try {
    i = JSON.parse(raw) as Interaction;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (i.type === PING) return Response.json({ type: PONG });
  if (i.type !== APPLICATION_COMMAND || i.data?.name !== "aspire") return Response.json({ error: "unknown_interaction" }, { status: 400 });

  const lang = langFromLocale(i.locale);
  const sub = i.data.options?.[0];
  const userId = i.member?.user?.id ?? i.user?.id ?? "";
  const chatId = i.channel_id ?? i.channel?.id ?? userId;
  const usage = Response.json({ type: CHANNEL_MESSAGE, data: { content: botText(lang).askUsage, flags: EPHEMERAL } });

  if (sub?.name === "ask") {
    const question = optionText(sub, "question");
    if (!question) return usage;
    after(async () => {
      let text: string;
      try {
        text = (await handleBotMessage({ platform: "discord", platformUserId: userId, chatId, text: question })).text;
      } catch (e) {
        log("ask", e);
        text = fallbackLine(detectTextLanguage(question));
      }
      await discordReply(i.application_id, i.token, text).catch((e) => log("reply", e));
    });
    return Response.json({ type: DEFERRED_CHANNEL_MESSAGE });
  }

  if (sub?.name === "link") {
    const code = optionText(sub, "code");
    if (!code) return Response.json({ type: CHANNEL_MESSAGE, data: { content: botText(lang).linkUsage, flags: EPHEMERAL } });
    after(async () => {
      let linked = false;
      try {
        linked = linkTryAllowed("discord", userId) && !!(await redeemLinkCode(code, {
          platform: "discord",
          platformUserId: userId,
          chatId,
          chatTitle: i.channel?.name ?? "",
        }));
      } catch (e) {
        log("link", e);
      }
      const text = linked ? botText(lang).linked : botText(lang).linkUnavailable;
      await discordReply(i.application_id, i.token, text, EPHEMERAL).catch((e) => log("reply", e));
    });
    return Response.json({ type: DEFERRED_CHANNEL_MESSAGE, data: { flags: EPHEMERAL } });
  }

  return usage;
}
