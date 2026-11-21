// Telegram webhook. Answers 200 at once and does the work in after(), so a slow
// answer never makes Telegram re-deliver the update (and duplicates are dropped).
import { after } from "next/server";
import { readText, WEBHOOK_MAX_BYTES } from "@/lib/body";
import { fallbackLine, forSpeech } from "@/lib/brain/shared";
import { handleBotMessage, redeemLinkCode } from "@/lib/bots/core";
import { recentIds, safeEqual } from "@/lib/bots/secure";
import { downloadTelegramFile, sendChatAction, sendTelegram, sendTelegramVoice } from "@/lib/bots/telegram";
import { botText, langFromLocale } from "@/lib/bots/text";
import { chooseSpokenLanguage, type Lang } from "@/lib/lang";
import { linkTryAllowed } from "@/lib/rate-limit";
import { synthesize, transcribe } from "@/lib/speech";

export const maxDuration = 60;

interface TgUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  language_code?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string; title?: string };
  text?: string;
  caption?: string;
  voice?: { file_id: string; duration?: number };
  reply_to_message?: { from?: TgUser };
}
interface TgUpdate {
  update_id?: unknown;
  message?: TgMessage;
}

type Plan =
  | { kind: "welcome" | "linkUsage" }
  | { kind: "link"; code: string }
  | { kind: "ask"; text: string }
  | { kind: "voice"; fileId: string };

// Telegram retries an update until it gets a 200; remember recent ids per instance.
const updates = recentIds<number>(1000);

const MAX_VOICE_SECONDS = 300;
const MAX_SPOKEN_CHARS = 1200;

const botName = () => (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Decide what (if anything) to do with a message. Groups: only /aspire, @mentions and replies to the bot. */
function plan(msg: TgMessage): Plan | null {
  if (msg.from?.is_bot) return null;
  const name = botName();
  const raw = (msg.text ?? msg.caption ?? "").trim();
  const isPrivate = msg.chat.type === "private";

  const cmd = /^\/([a-z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i.exec(raw);
  if (cmd) {
    if (cmd[2] && cmd[2].toLowerCase() !== name) return null; // a command for another bot
    const command = cmd[1].toLowerCase();
    const arg = (cmd[3] ?? "").trim();
    if (command === "start") return arg ? { kind: "link", code: arg } : { kind: "welcome" };
    if (command === "link") return arg ? { kind: "link", code: arg } : { kind: "linkUsage" };
    if (command === "aspire") {
      if (arg) return { kind: "ask", text: arg };
      return msg.voice ? { kind: "voice", fileId: msg.voice.file_id } : { kind: "welcome" };
    }
    return isPrivate ? { kind: "welcome" } : null; // /help and unknown commands
  }

  const mention = name ? new RegExp(`@${escapeRe(name)}(?![\\w])`, "gi") : null;
  const mentioned = !!mention && mention.test(raw);
  const repliedToBot = !!name && msg.reply_to_message?.from?.is_bot === true && msg.reply_to_message.from.username?.toLowerCase() === name;
  if (!isPrivate && !mentioned && !repliedToBot) return null;

  if (msg.voice) return (msg.voice.duration ?? 0) <= MAX_VOICE_SECONDS ? { kind: "voice", fileId: msg.voice.file_id } : null;
  const text = (mention ? raw.replace(mention, " ") : raw).replace(/\s+/g, " ").trim();
  return text ? { kind: "ask", text } : null;
}

async function toBytes(body: BodyInit): Promise<Uint8Array> {
  return new Uint8Array(await new Response(body).arrayBuffer());
}

async function work(msg: TgMessage, p: Plan): Promise<void> {
  const chatId = String(msg.chat.id);
  const userId = String(msg.from?.id ?? msg.chat.id);
  const replyTo = msg.chat.type === "private" ? undefined : msg.message_id;
  let lang: Lang = langFromLocale(msg.from?.language_code);
  const t = () => botText(lang);

  try {
    switch (p.kind) {
      case "welcome":
        return await sendTelegram(chatId, t().welcome, replyTo);
      case "linkUsage":
        return await sendTelegram(chatId, t().linkUsage, replyTo);
      case "link": {
        if (!linkTryAllowed("telegram", userId)) return await sendTelegram(chatId, t().linkUnavailable, replyTo);
        const user = await redeemLinkCode(p.code, {
          platform: "telegram",
          platformUserId: userId,
          chatId,
          chatTitle: msg.chat.title ?? "",
        });
        return await sendTelegram(chatId, user ? t().linked : t().linkUnavailable, replyTo);
      }
      case "ask": {
        await sendChatAction(chatId, "typing");
        const reply = await handleBotMessage({ platform: "telegram", platformUserId: userId, chatId, text: p.text });
        lang = reply.lang;
        return await sendTelegram(chatId, reply.text, replyTo);
      }
      case "voice": {
        await sendChatAction(chatId, "typing");
        const heard = await transcribe(await downloadTelegramFile(p.fileId));
        if (!heard.text.trim()) return await sendTelegram(chatId, t().didntHear, replyTo);
        lang = chooseSpokenLanguage(heard.text, heard.probs);
        const reply = await handleBotMessage({ platform: "telegram", platformUserId: userId, chatId, text: heard.text, lang });
        lang = reply.lang;
        await sendTelegram(chatId, reply.text, replyTo);
        try {
          await sendChatAction(chatId, "record_voice");
          const audio = await synthesize(forSpeech(reply.text).slice(0, MAX_SPOKEN_CHARS), reply.lang, "jarvis", "ogg");
          await sendTelegramVoice(chatId, await toBytes(audio.body), replyTo);
        } catch (e) {
          // The text answer is already there; a missing voice reply is not worth an error message.
          console.error("[bot:telegram] voice reply failed:", e instanceof Error ? e.message.slice(0, 200) : "unknown");
        }
        return;
      }
    }
  } catch (e) {
    console.error(`[bot:telegram] ${p.kind} failed:`, e instanceof Error ? e.message.slice(0, 200) : "unknown");
    await sendTelegram(chatId, fallbackLine(lang), replyTo).catch(() => undefined);
  }
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(given, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const raw = await readText(req, WEBHOOK_MAX_BYTES);
  let update: TgUpdate | null = null;
  try {
    update = raw ? (JSON.parse(raw) as TgUpdate) : null;
  } catch {
    // Not JSON: answered like an empty update below.
  }
  if (!update || typeof update.update_id !== "number") return Response.json({ ok: true });
  if (!updates.firstTime(update.update_id)) return Response.json({ ok: true }); // re-delivery

  const msg = update.message;
  if (!msg?.chat || typeof msg.message_id !== "number") return Response.json({ ok: true });
  const p = plan(msg);
  if (p) after(() => work(msg, p));
  return Response.json({ ok: true });
}
