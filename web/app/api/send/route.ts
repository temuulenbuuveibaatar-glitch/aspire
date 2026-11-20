import { rateLimit } from "@/lib/rate-limit";
import { isAllowedWebhook } from "@/lib/webhooks";

export const maxDuration = 30;

// POST { channel: "telegram"|"discord"|"slack", text, target: { chatId?, webhookUrl? } } -> { ok: true }
// Called only after the person pressed Send on a confirm card. Discord/Slack go to the
// channel webhook the person saved in Connections; we store nothing and never log the
// message text or the webhook URL (the URL itself is a secret that allows posting).
// TODO(auth): require a Supabase session (`requireUser`) once auth lands; rate limit per user then.

const MAX_TEXT = 2000;

export async function POST(req: Request) {
  const limited = rateLimit(req, "send", 10);
  if (limited) return limited;

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
    // TODO(task 13): check chatId is one of the user's telegram bot_links rows (else 403), then
    // `await sendTelegramToLinkedChat(userId, chatId, text)` from "@/lib/bots/telegram-send".
    return Response.json({ error: "telegram_not_ready" }, { status: 501 });
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
