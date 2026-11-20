// GET -> { links: [{ id, platform, title, isPrimary, linkedAt }] }: the person's linked chats.
import { linkingUser, serverError } from "@/lib/bots/guard";
import { listLinks } from "@/lib/bots/links";

export async function GET(req: Request) {
  const user = await linkingUser(req, "link-list", 60);
  if (user instanceof Response) return user;
  try {
    const links = (await listLinks(user.id)).map((l) => ({
      id: l.id,
      platform: l.platform,
      title: l.chatTitle,
      isPrimary: l.isPrimary,
      linkedAt: l.linkedAt,
    }));
    return Response.json({ links }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverError("link", e);
  }
}
