// open_app: "open Spotify / VS Code / Telegram / settings / calculator / mail" from the web, no install.
// No network. It puts an "Open <app>" card on screen; browsers only open custom schemes from a tap,
// so nothing opens until the person presses the button.
import { APPS, buildAppLink, closeApps, PLATFORM_NAMES, resolveApp, SETTINGS_PAGES } from "@/lib/app-links";
import { type OpenAppAction, str, type Tool } from "./types";

export const openApp: Tool = {
  name: "open_app",
  label: { mn: "Апп нээх", en: "Open app" },
  description:
    "Show a button that opens an app installed on the person's device (or its web version). Use when they ask to open or launch an app. " +
    `Known apps: ${APPS.map((a) => a.name).join(", ")}. ` +
    "It does NOT open the app by itself: say the button is ready, never that the app is open. Netflix has no public API: it can open Netflix or search a title, never sign in, play or read their account. Unknown apps return close matches; offer those, do not guess.",
  parameters: {
    type: "object",
    properties: {
      app: { type: "string", description: "The app name as the person said it, e.g. 'Spotify', 'телеграм', '计算器', 'settings'" },
      target: {
        type: "string",
        description:
          "Optional, empty string if none: search text (Spotify, YouTube, Google Maps, Amap, Baidu Maps), a film or show title (Netflix), an email address (Mail), a phone number (Phone, WhatsApp), " +
          `a @username (Telegram) or a Windows settings page (${Object.keys(SETTINGS_PAGES).join(", ")})`,
      },
    },
    required: ["app", "target"],
  },
  async run(input, ctx) {
    const query = str(input.app, 80);
    if (!query) return { error: "app is required" };
    const lang = ctx.lang ?? "en";
    const found = resolveApp(query, lang);
    if (!found) {
      const close = closeApps(query, lang);
      return {
        error: `"${query}" is not in the list of apps I can open`,
        closeMatches: close,
        note: close.length ? "Ask if they meant one of closeMatches" : "Say you cannot open that app; they can open it themselves",
      };
    }
    const { app, name } = found;
    const link = buildAppLink(app, str(input.target, 200));
    const action: OpenAppAction = { type: "open_app", id: app.id, name, scheme: link.scheme, web: link.web };
    ctx.actions.push(action);
    return {
      shown: "open_app button",
      app: name,
      worksOn: app.platforms.map((p) => PLATFORM_NAMES[p]),
      webFallback: link.web !== "",
      ...(link.targetUsed ? { target: "included" } : {}),
      ...(link.targetError ? { targetIgnored: link.targetError } : {}),
      note: "The person taps the button to open it (only if installed); do not say it is open",
    };
  },
};

export const appTools: Tool[] = [openApp];
