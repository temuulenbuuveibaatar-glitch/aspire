// Slack OAuth callback: check the state cookie, exchange the code for a bot token,
// and hand the installation to the install store.
import { requireUser } from "@/lib/auth";
import { checkOAuthState, readCookie, SLACK_STATE_COOKIE, siteUrl, slackInstallStore } from "@/lib/bots/slack";

const clearCookie = `${SLACK_STATE_COOKIE}=; Path=/api/bots/slack; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

const redirect = (location: string) =>
  new Response(null, { status: 302, headers: { Location: location, "Set-Cookie": clearCookie, "Cache-Control": "no-store" } });

interface OAuthAccess {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = siteUrl(req);
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const secret = process.env.CRON_SECRET ?? "";

  if (url.searchParams.get("error")) return redirect(`${site}/?slack=cancelled`);

  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !checkOAuthState(secret, state, readCookie(req, SLACK_STATE_COOKIE))) {
    return Response.json({ error: "bad_state" }, { status: 400, headers: { "Set-Cookie": clearCookie } });
  }
  if (!clientId || !clientSecret) return Response.json({ error: "slack_not_configured" }, { status: 503 });

  try {
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ code, redirect_uri: `${site}/api/bots/slack/oauth` }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as OAuthAccess | null;
    if (!data?.ok || !data.access_token || !data.team?.id) {
      console.error("[bot:slack] oauth exchange failed:", String(data?.error ?? res.status).slice(0, 100));
      return redirect(`${site}/?slack=error`);
    }
    await slackInstallStore().put({
      teamId: data.team.id,
      botUserId: data.bot_user_id ?? "",
      botToken: data.access_token,
      installedBy: (await requireUser())?.id ?? null, // the signed-in Aspire user, when there is one
    });
    return redirect(`${site}/?slack=installed`);
  } catch (e) {
    console.error("[bot:slack] oauth failed:", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    return redirect(`${site}/?slack=error`);
  }
}
