// "Add to Slack": send the person to Slack's consent screen with a signed state cookie.
import { slackStateSecret } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { newOAuthState, SLACK_SCOPES, SLACK_STATE_COOKIE, siteUrl } from "@/lib/bots/slack";

export async function GET(req: Request) {
  const limited = rateLimit(req, "slack-install", 10);
  if (limited) return limited;
  const clientId = process.env.SLACK_CLIENT_ID;
  const secret = slackStateSecret();
  if (!clientId || !secret) return Response.json({ error: "slack_not_configured" }, { status: 503 });

  const { state, cookie } = newOAuthState(secret);
  const authorize = new URL("https://slack.com/oauth/v2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", SLACK_SCOPES);
  authorize.searchParams.set("redirect_uri", `${siteUrl(req)}/api/bots/slack/oauth`);
  authorize.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `${SLACK_STATE_COOKIE}=${encodeURIComponent(cookie)}; Path=/api/bots/slack; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      "Cache-Control": "no-store",
    },
  });
}
