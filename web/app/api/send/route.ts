import { requireUser, signedOut } from "@/lib/auth";
import { telegramTargets } from "@/lib/bots/links";
import { sendTelegram } from "@/lib/bots/telegram";
import { supabaseConfigured } from "@/lib/cloud";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isAllowedWebhook } from "@/lib/webhooks";

export const maxDuration = 30;

// POST { channel: "telegram"|"discord"|"slack", text, target: { chatId?, webhookUrl? } } -> { ok: true }
// Called only after the person pressed Send on a confirm card. Telegram goes through the bot to
// one of the person's linked chats (GET /api/link/targets lists them). Discord/Slack go to the
// channel webhook the person saved in Connections; we store nothing and never log the
// message text or the webhook URL (the URL itself is a secret that allows posting).
// Requires a session (401 otherwise). Limited per IP and per user.

const MAX_TEXT = 2000;

export async function POST(req: Request) {
  const limited = rateLimit(req, "send", 10);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`send-user:${user.id}`, 30); // one account cannot rotate IPs to run up the bill
  if (perUser) return perUser;

  const body = (await req.json().catch(() => null)) as {
    channel?: unknown;
    text?: unknown;
    target?: { chatId?: unknown; webhookUrl?: unknown };
  } | null;
  const channel = body?.channel;
  if (channel !== "telegram" && channel !== "discord" && channel !== "slack") {
    return Response.json({ error: "bad_channel" }, { status: 400 });
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT) return Response.json({ error: "bad_text" }, { status: 400 });

  if (channel === "telegram") {
    // Only to a chat this person linked (their private chat or a group they ran /link in).
    const chatId = body?.target?.chatId;
    if (typeof chatId !== "string" || !/^-?\d{1,20}$/.test(chatId)) return Response.json({ error: "bad_target" }, { status: 400 });
    if (!supabaseConfigured()) return Response.json({ error: "linking_unavailable" }, { status: 503 });
    try {
      const targets = await telegramTargets(user.id);
      if (!targets.some((t) => t.chatId === chatId)) return Response.json({ error: "not_linked_chat" }, { status: 403 });
      await sendTelegram(chatId, text);
      return Response.json({ ok: true });
    } catch (e) {
      // The bot token is part of Telegram URLs: log only the error name.
      console.error("[send:telegram] failed", e instanceof Error ? e.name : "error");
      return Response.json({ error: "send_failed" }, { status: 502 });
    }
  }

  // Allow-list check happens before any request is made (no SSRF).
  const webhookUrl = body?.target?.webhookUrl;
  if (typeof webhookUrl !== "string" || !isAllowedWebhook(channel, webhookUrl)) {
    return Response.json({ error: "webhook_not_allowed" }, { status: 400 });
  }

  // Discord: never let a message ping @everyone, roles or users.
  const payload = channel === "discord" ? { content: text, allowed_mentions: { parse: [] } } : { text };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[send:${channel}] webhook answered ${res.status}`);
      return Response.json({ error: "send_failed", status: res.status }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error(`[send:${channel}] webhook request failed`, e instanceof Error ? e.name : "error");
    return Response.json({ error: "send_failed" }, { status: 502 });
  }
}
