// The page inside Aspire Desktop (Tauri, withGlobalTauri): window.__TAURI__.core.invoke reaches three
// native commands. desktop_open_url and desktop_open_app each show a native Allow/Deny dialog and
// resolve { ok, message }; desktop_capabilities resolves { version, commands }. In a normal browser
// there is no bridge and every call resolves { ok: false } at once, so callers keep their link buttons.
// The checks here are a first filter only: the native dialog (and the desktop's own checks) decide.
import { checkAppAction } from "@/lib/app-links";
import type { OpenAppAction } from "@/lib/tools/types";
import { httpsUrl } from "@/lib/utils";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
export interface BridgeResult {
  ok: boolean;
  message: string;
}

/** Same rule as the server's desktop jobs: a plain app name, no paths or arguments. */
const APP_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._+&'-]{0,79}$/u;
const DESK = new Set(["windows", "mac", "linux"]);

function invoker(): Invoke | null {
  if (typeof window === "undefined") return null;
  const inv = (window as { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__?.core?.invoke;
  return typeof inv === "function" ? (inv as Invoke) : null;
}

/** True inside Aspire Desktop (the native bridge is present). */
export const inDesktopApp = (): boolean => invoker() !== null;

async function call(cmd: string, args: Record<string, unknown>): Promise<BridgeResult> {
  const inv = invoker();
  if (!inv) return { ok: false, message: "not_desktop" };
  try {
    const r = (await inv(cmd, args)) as Partial<BridgeResult> | null;
    return { ok: r?.ok === true, message: typeof r?.message === "string" ? r.message.slice(0, 300) : "" };
  } catch (e) {
    return { ok: false, message: String(e).slice(0, 300) };
  }
}

/** Opens an https URL in the person's browser after they allow it in the native dialog. */
export function desktopOpenUrl(url: string): Promise<BridgeResult> {
  const u = httpsUrl(url);
  return u && u.length <= 2048 ? call("desktop_open_url", { url: u }) : Promise.resolve({ ok: false, message: "bad_url" });
}

/** Opens an installed app by name after they allow it in the native dialog. */
export function desktopOpenApp(name: string): Promise<BridgeResult> {
  const n = String(name ?? "").trim();
  // No word may look like a command-line switch ("calc --evil").
  return APP_RE.test(n) && !/\s-/.test(n) ? call("desktop_open_app", { name: n }) : Promise.resolve({ ok: false, message: "bad_name" });
}

/** What this desktop build can do; null outside it or on a malformed answer. */
export async function desktopCapabilities(): Promise<{ version: string; commands: string[] } | null> {
  const inv = invoker();
  if (!inv) return null;
  try {
    const r = (await inv("desktop_capabilities")) as { version?: unknown; commands?: unknown } | null;
    if (!r || typeof r.version !== "string" || !Array.isArray(r.commands)) return null;
    return { version: r.version.slice(0, 40), commands: r.commands.filter((c): c is string => typeof c === "string").slice(0, 50) };
  } catch {
    return null;
  }
}

/**
 * An open_app card's action on the desktop: a link with a target (a search, an address) or a web-only
 * app opens its checked https link; a desktop app opens by its catalog name. Null = nothing to open.
 */
export function desktopOpenAction(action: OpenAppAction): Promise<BridgeResult> | null {
  const ok = checkAppAction(action);
  if (!ok) return null;
  const native = ok.app.platforms.some((p) => DESK.has(p)) && !ok.scheme.startsWith("https:");
  if (ok.web && (ok.target || !native)) return desktopOpenUrl(ok.web);
  // A target with no web link (a number to call) is never dropped silently: the card's own link opens it.
  return native && !ok.target ? desktopOpenApp(ok.app.name) : null;
}
