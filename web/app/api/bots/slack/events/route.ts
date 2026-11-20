// Slack Events API: @Aspire mentions and direct messages, answered in a thread.
// Slack wants a 200 within 3 s (and retries otherwise), so the answer is posted from after().
import { after } from "next/server";
import { fallbackLine } from "@/lib/brain/shared";
import { handleBotMessage, redeemLinkCode } from "@/lib/bots/core";
import { cleanSlackText, getSlackToken, slackInstallStore, slackPost, verifySlack } from "@/lib/bots/slack";
import { botText } from "@/lib/bots/text";
import { detectTextLanguage } from "@/lib/lang";

export const maxDuration = 60;

interface SlackEvent {
  type?: string;
  subtype?: string;
  bot_id?: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  tokens?: { bot?: string[] };
}
interface SlackEnvelope {
  type?: string;
  challenge?: string;
  team_id?: string;
  event?: SlackEvent;
  authorizations?: Array<{ user_id?: string }>;
}

const log = (what: string, e: unknown) =>
  console.error(`[bot:slack] ${what} failed:`, e instanceof Error ? e.message.slice(0, 200) : "unknown");

const LINK_DM = /^link\s+(\S+)$/i;

async function answer(teamId: string, ev: Required<Pick<SlackEvent, "user" | "channel" | "ts">> & SlackEvent, text: string) {
  const token = await getSlackToken(teamId);
  if (!token) return log("token lookup", new Error("no installation for team"));
  const threadTs = ev.thread_ts ?? ev.ts;

  const link = ev.channel_type === "im" ? LINK_DM.exec(text) : null;
  if (link) {
    let linked = false;
    try {
      linked = !!(await redeemLinkCode(link[1], { platform: "slack", platformUserId: ev.user, chatId: ev.channel, chatTitle: "" }));
    } catch (e) {
      log("link", e);
    }
    const t = botText(detectTextLanguage(text));
    return slackPost(token, ev.channel, linked ? t.linked : t.linkUnavailable, threadTs).catch((e) => log("post", e));
  }

  let reply: string;
  try {
    reply = (await handleBotMessage({ platform: "slack", platformUserId: ev.user, chatId: ev.channel, text })).text;
  } catch (e) {
    log("answer", e);
    reply = fallbackLine(detectTextLanguage(text));
  }
  await slackPost(token, ev.channel, reply, threadTs).catch((e) => log("post", e));
}

export async function POST(req: Request) {
  const raw = await req.text();
  const ok = verifySlack(
    process.env.SLACK_SIGNING_SECRET ?? "",
    req.headers.get("x-slack-request-timestamp") ?? "",
    raw,
    req.headers.get("x-slack-signature") ?? "",
    new Date(),
  );
  if (!ok) return Response.json({ error: "invalid_signature" }, { status: 401 });

  let body: SlackEnvelope;
  try {
    body = JSON.parse(raw) as SlackEnvelope;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.type === "url_verification") return Response.json({ challenge: body.challenge ?? "" });
  // Retries happen when a first delivery was slow; that delivery is already being answered.
  if (req.headers.get("x-slack-retry-num")) return new Response(null, { status: 200 });
  if (body.type !== "event_callback" || !body.event || !body.team_id) return new Response(null, { status: 200 });

  const teamId = body.team_id;
  const ev = body.event;

  if (ev.type === "app_uninstalled" || (ev.type === "tokens_revoked" && (ev.tokens?.bot?.length ?? 0) > 0)) {
    await slackInstallStore()
      .delete(teamId)
      .catch((e) => log("uninstall", e));
    return new Response(null, { status: 200 });
  }

  const addressed = ev.type === "app_mention" || (ev.type === "message" && ev.channel_type === "im");
  if (!addressed || ev.bot_id || ev.subtype || !ev.user || !ev.channel || !ev.ts) return new Response(null, { status: 200 });

  const text = cleanSlackText(ev.text ?? "", body.authorizations?.[0]?.user_id);
  if (!text) return new Response(null, { status: 200 });
  const event = { ...ev, user: ev.user, channel: ev.channel, ts: ev.ts };
  after(() => answer(teamId, event, text));
  return new Response(null, { status: 200 });
}
