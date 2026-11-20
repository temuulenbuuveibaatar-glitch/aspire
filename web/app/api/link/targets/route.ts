// GET -> { targets: [{ chatId, title }] }: the person's linked Telegram chats (their private chat
// and groups they ran /link in), i.e. where "send for me" may post through the bot.
import { linkingUser, serverError } from "@/lib/bots/guard";
import { telegramTargets } from "@/lib/bots/links";

export async function GET(req: Request) {
  const user = await linkingUser(req, "link-targets", 60);
  if (user instanceof Response) return user;
  try {
    return Response.json({ targets: await telegramTargets(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError("link/targets", e);
  }
}
