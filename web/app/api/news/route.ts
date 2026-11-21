import { requireUser, signedOut } from "@/lib/auth";
import { isLang } from "@/lib/lang";
import { headlinesFor, NewsError, toCountry } from "@/lib/news";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

// GET /api/news?lang=en&country=MN -> { headlines } for the HUD news strip.
// No country (or an unknown code) falls back to the network country, then to the default mix.
// Upstream is cached 1 h per query in lib/news.ts; errors are { error: "not_configured" | "unavailable" }.
export async function GET(req: Request) {
  const limited = rateLimit(req, "news", 60);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();
  const perUser = rateLimitKey(`news:${user.id}`, 10);
  if (perUser) return perUser;

  const url = new URL(req.url);
  const lang = url.searchParams.get("lang");
  const country = toCountry(url.searchParams.get("country")) ?? toCountry(req.headers.get("x-vercel-ip-country"));
  try {
    const headlines = await headlinesFor(isLang(lang) ? lang : "en", country, 5);
    return Response.json({ headlines }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    const code = e instanceof NewsError ? e.code : "unavailable";
    if (!(e instanceof NewsError)) console.error("news:", e instanceof Error ? e.name : "error");
    return Response.json({ error: code }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
