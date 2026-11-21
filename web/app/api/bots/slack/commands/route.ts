// Slack slash command /aspire: "link <code>" or a question. Questions are acked at
// once with "Thinking…" and answered through response_url from after().
import { after } from "next/server";
import { readText, WEBHOOK_MAX_BYTES } from "@/lib/body";
import { fallbackLine } from "@/lib/brain/shared";
import { handleBotMessage, redeemLinkCode } from "@/lib/bots/core";
import { slackRespond, verifySlack } from "@/lib/bots/slack";
import { botText } from "@/lib/bots/text";
import { detectTextLanguage } from "@/lib/lang";
import { linkTryAllowed, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

const log = (what: string, e: unknown) =>
  console.error(`[bot:slack] ${what} failed:`, e instanceof Error ? e.message.slice(0, 200) : "unknown");

const ephemeral = (text: string) => Response.json({ response_type: "ephemeral", text });

export async function POST(req: Request) {
  const limited = rateLimit(req, "bot-slack-commands", 300);
  if (limited) return limited;
  const raw = await readText(req, WEBHOOK_MAX_BYTES);
  if (raw === null) return Response.json({ error: "invalid_signature" }, { status: 401 });
  const ok = verifySlack(
    process.env.SLACK_SIGNING_SECRET ?? "",
    req.headers.get("x-slack-request-timestamp") ?? "",
    raw,
    req.headers.get("x-slack-signature") ?? "",
    new Date(),
  );
  if (!ok) return Response.json({ error: "invalid_signature" }, { status: 401 });

  const form = new URLSearchParams(raw);
  const text = (form.get("text") ?? "").trim().slice(0, 2000);
  const userId = form.get("user_id") ?? "";
  const channelId = form.get("channel_id") ?? "";
  const responseUrl = form.get("response_url") ?? "";
  const t = botText(detectTextLanguage(text || "hi"));

  if (!text) return ephemeral(t.askUsage);

  const link = /^link(?:\s+(\S+))?$/i.exec(text);
  if (link) {
    if (!link[1]) return ephemeral(t.linkUsage);
    if (!linkTryAllowed("slack", userId, form.get("team_id") ?? "")) return ephemeral(t.linkUnavailable);
    const user = await redeemLinkCode(link[1], {
      platform: "slack",
      platformUserId: userId,
      chatId: channelId,
      chatTitle: form.get("channel_name") ?? "",
      teamId: form.get("team_id") ?? undefined,
    }).catch((e) => {
      log("link", e);
      return null;
    });
    return ephemeral(user ? t.linked : t.linkUnavailable);
  }

  after(async () => {
    let reply: string;
    try {
      reply = (await handleBotMessage({ platform: "slack", platformUserId: userId, chatId: channelId, text })).text;
    } catch (e) {
      log("answer", e);
      reply = fallbackLine(detectTextLanguage(text));
    }
    try {
      await slackRespond(responseUrl, { response_type: "in_channel", replace_original: true, text: reply });
    } catch {
      // Replacing the "Thinking…" message can fail; post the answer as a new message instead.
      await slackRespond(responseUrl, { response_type: "in_channel", text: reply }).catch((e) => log("respond", e));
    }
  });
  return Response.json({ response_type: "in_channel", text: t.thinking });
}
