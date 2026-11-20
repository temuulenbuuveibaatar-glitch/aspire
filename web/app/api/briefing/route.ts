import { requireUser, signedOut } from "@/lib/auth";
import { makeBriefing } from "@/lib/briefing";
import { googleAccessToken } from "@/lib/google-token";
import { isLang, type Lang } from "@/lib/lang";
import { rateLimit } from "@/lib/rate-limit";
import type { Reminder, Title } from "@/lib/tools/types";

export const maxDuration = 60;

// POST { lang, reminders, title? } -> { text, mailCount, gmailError }
// Google tokens stay with Clerk; mail headers are used for this answer only and never stored.
export async function POST(req: Request) {
  const limited = rateLimit(req, "briefing", 6);
  if (limited) return limited;
  const user = await requireUser();
  if (!user) return signedOut();

  const body = (await req.json().catch(() => null)) as { lang?: unknown; reminders?: unknown; title?: unknown } | null;
  const lang: Lang = isLang(body?.lang) ? body.lang : "mn";
  const title: Title = body?.title === "mr" || body?.title === "mrs" ? body.title : "";
  const reminders: Reminder[] = Array.isArray(body?.reminders)
    ? (body.reminders as Reminder[])
        .filter((r) => r && typeof r.id === "string" && typeof r.text === "string" && typeof r.at === "string")
        .slice(0, 30)
        .map((r) => ({ id: r.id.slice(0, 40), text: r.text.slice(0, 200), at: r.at.slice(0, 40), repeatDaily: r.repeatDaily === true }))
    : [];

  const accessToken = await googleAccessToken(user.id);
  const result = await makeBriefing({ lang, title, reminders, accessToken, now: new Date() });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
