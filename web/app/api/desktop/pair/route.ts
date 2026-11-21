// Aspire Desktop pairings.
// POST { code, deviceName } (from the helper, no session) -> { token, deviceId, name }: the code
//   (10 characters, see lib/desktop.ts) works once; the token is shown only here (the server
//   keeps its hash). Guessing is capped per IP. No shared bucket: one client rotating IPs could
//   keep it full and lock everyone out, and codes (~49.5 bits, 10 minutes, single use) need none.
// GET (signed in) -> { devices: [{ id, name, createdAt, lastSeen }] }
// DELETE { deviceId } (signed in) -> { ok }: unlink a device; its token stops working.
import { supabaseConfigured } from "@/lib/cloud";
import { linkingUser, readJson, serverError } from "@/lib/bots/guard";
import { DESKTOP_CODE_RE, listDesktopDevices, normalizeDesktopCode, pairDesktop, removeDesktopDevice } from "@/lib/desktop";
import { rateLimit } from "@/lib/rate-limit";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  const limited = rateLimit(req, "desktop-pair", 10);
  if (limited) return limited;
  if (!supabaseConfigured()) return Response.json({ error: "linking_unavailable" }, { status: 503 });
  const body = await readJson<{ code?: unknown; deviceName?: unknown }>(req, 2048);
  const code = normalizeDesktopCode(body?.code);
  if (!DESKTOP_CODE_RE.test(code)) return Response.json({ error: "bad_code" }, { status: 400 });
  try {
    const paired = await pairDesktop(code, typeof body?.deviceName === "string" ? body.deviceName : "");
    if (!paired) return Response.json({ error: "bad_code" }, { status: 400 });
    return Response.json({ token: paired.token, deviceId: paired.device.id, name: paired.device.name }, { headers: NO_STORE });
  } catch (e) {
    return serverError("desktop/pair", e);
  }
}

export async function GET(req: Request) {
  const user = await linkingUser(req, "desktop-list", 60);
  if (user instanceof Response) return user;
  try {
    const devices = (await listDesktopDevices(user.id)).map(({ id, name, createdAt, lastSeen }) => ({ id, name, createdAt, lastSeen }));
    return Response.json({ devices }, { headers: NO_STORE });
  } catch (e) {
    return serverError("desktop/list", e);
  }
}

export async function DELETE(req: Request) {
  const user = await linkingUser(req, "desktop-unlink", 20);
  if (user instanceof Response) return user;
  const body = await readJson<{ deviceId?: unknown }>(req, 1024);
  if (typeof body?.deviceId !== "string") return Response.json({ error: "bad_device" }, { status: 400 });
  try {
    if (!(await removeDesktopDevice(user.id, body.deviceId))) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError("desktop/unlink", e);
  }
}
