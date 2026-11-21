import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpenAppCard } from "@/components/aspire/OpenAppCard";
import { APPS, appById, buildAppLink, checkAppAction, closeApps, detectPlatform, encodeTarget, normalizeAppQuery, resolveApp } from "@/lib/app-links";
import { LANGS } from "@/lib/lang";
import type { OpenAppAction } from "@/lib/tools/types";
import { appTools, openApp } from "@/lib/tools/apps";
import type { ToolContext } from "@/lib/tools/types";

const ctx = (lang: ToolContext["lang"] = "en"): ToolContext => ({ now: new Date(), lang, device: { memory: {}, reminders: [] }, actions: [] });
const run = async (app: string, target = "", lang: ToolContext["lang"] = "en") => {
  const c = ctx(lang);
  const out = (await openApp.run({ app, target }, c)) as Record<string, unknown>;
  return { out, actions: c.actions as unknown as OpenAppAction[] };
};
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

describe("catalog", () => {
  it("has ~40 apps with unique ids and no alias shared between apps", () => {
    expect(APPS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(APPS.map((a) => a.id)).size).toBe(APPS.length);
    const owner = new Map<string, string>();
    for (const a of APPS)
      for (const n of [a.name, a.id, ...Object.values(a.local ?? {}), ...a.aliases].map(normalizeAppQuery)) {
        if (owner.has(n)) expect(owner.get(n), n).toBe(a.id);
        owner.set(n, a.id);
      }
  });

  it("never uses a dangerous scheme; web fallbacks are https", () => {
    for (const a of APPS) {
      for (const s of [a.scheme, a.mac, a.target?.scheme].filter(Boolean) as string[]) {
        const proto = SCHEME.exec(s)?.[1].toLowerCase();
        expect(proto, s).toBeTruthy();
        expect(["javascript", "data", "vbscript", "file", "blob", "http", "https", "about"]).not.toContain(proto);
      }
      for (const w of [a.web, a.target?.web].filter(Boolean) as string[]) expect(w.startsWith("https://"), w).toBe(true);
      expect(a.platforms.length).toBeGreaterThan(0);
    }
  });

  it("has no emojis or arrows in names", () => {
    const src = readFileSync(fileURLToPath(new URL("../lib/app-links.ts", import.meta.url)), "utf8");
    expect(/[\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}]|\p{Extended_Pictographic}/u.test(src)).toBe(false);
  });
});

describe("resolveApp", () => {
  it.each([
    ["Spotify", "spotify"],
    ["open spotify please", "spotify"],
    ["spotfy", "spotify"],
    ["VS Code", "vscode"],
    ["visual studio code", "vscode"],
    ["телеграм", "telegram"],
    ["открой телеграмм", "telegram"],
    ["打开微信", "wechat"],
    ["计算器", "calculator"],
    ["тооны машин нээ", "calculator"],
    ["Einstellungen öffnen", "settings"],
    ["настройки", "settings"],
    ["system preferences", "settings"],
    ["Gmail", "mail"],
    ["почту", "mail"],
    ["Microsoft Teams", "teams"],
    ["claude code", "claude"],
    ["twitter", "x"],
    ["Apple Music", "apple-music"],
  ])("%s -> %s", (q, id) => {
    expect(resolveApp(q, "en")?.app.id).toBe(id);
  });

  it("names the app in the person's language", () => {
    expect(resolveApp("calculator", "ru")?.name).toBe("Калькулятор");
    expect(resolveApp("settings", "mn")?.name).toBe("Тохиргоо");
    expect(resolveApp("spotify", "zh")?.name).toBe("Spotify");
  });

  it("returns null for unknown or ambiguous names and suggests close ones", () => {
    expect(resolveApp("Photoshop", "en")).toBeNull();
    expect(resolveApp("", "en")).toBeNull();
    expect(resolveApp("open", "en")).toBeNull();
    expect(resolveApp("cal", "en")).toBeNull();
    expect(closeApps("cal", "en")).toEqual(expect.arrayContaining(["Calculator", "Calendar"]));
  });

  it.each(["team", "room", "Lime", "Motion", "Sigma", "world", "work", "maid", "Snack", "Fiber", "stream"])(
    "does not guess from a one-letter typo of a short name: %s",
    (q) => {
      expect(resolveApp(q, "en")).toBeNull();
    },
  );

  it("still suggests the nearest app for a near miss", () => {
    expect(closeApps("team", "en")[0]).toBe("Microsoft Teams");
  });
});

describe("targets", () => {
  it("encodes and validates each kind", () => {
    expect(encodeTarget("query", "lo fi & chill")).toBe("lo%20fi%20%26%20chill");
    expect(encodeTarget("email", "a@b.mn")).toBe("a%40b.mn");
    expect(encodeTarget("email", "not an email")).toBeNull();
    expect(encodeTarget("phone", "+976 9911-2233")).toBe("+97699112233");
    expect(encodeTarget("digits", "+976 9911-2233")).toBe("97699112233");
    expect(encodeTarget("phone", "12")).toBeNull();
    expect(encodeTarget("phone", "javascript:alert(1)")).toBeNull();
    expect(encodeTarget("username", "@durov_name")).toBe("durov_name");
    expect(encodeTarget("username", "a/b?c")).toBeNull();
    expect(encodeTarget("settings", "Wi-Fi")).toBe("network-wifi");
    expect(encodeTarget("settings", "../../etc")).toBeNull();
  });

  it("builds deep links and drops bad targets truthfully", () => {
    const spotify = appById("spotify")!;
    expect(buildAppLink(spotify, "queen")).toEqual({ scheme: "spotify:search:queen", web: "https://open.spotify.com/search/queen", targetUsed: true });
    const bad = buildAppLink(appById("telegram")!, "x y");
    expect(bad.scheme).toBe("tg://");
    expect(bad.targetError).toMatch(/not a valid username/);
    expect(buildAppLink(appById("calculator")!, "2+2").targetError).toMatch(/does not take a target/);
    expect(buildAppLink(appById("settings")!, "bluetooth").scheme).toBe("ms-settings:bluetooth");
  });

  it("rejects email addresses that could add mailto headers", () => {
    expect(encodeTarget("email", "a?cc=b@c.d")).toBeNull();
    expect(encodeTarget("email", "a&body=x@c.d")).toBeNull();
    expect(encodeTarget("email", "x?attach=/etc/passwd&body=hi@a.bc")).toBeNull();
    expect(encodeTarget("email", "болд@жишээ.мн")).not.toBeNull();
  });

  it("drops a target whose encoding is too long, so the card is never silently empty", () => {
    const spotify = appById("spotify")!;
    for (const n of [100, 200]) {
      const l = buildAppLink(spotify, "中".repeat(n));
      expect(l.targetUsed).toBe(false);
      expect(l.targetError).toBeTruthy();
    }
    expect(buildAppLink(spotify, "中".repeat(70)).targetUsed).toBe(true);
  });

  it("every link the server builds passes the client re-check", () => {
    const samples = ["queen", "lo fi & chill", "中".repeat(70), "Улаанбаатар", "a@b.mn", "+976 9911-2233", "@durov_name", "wifi", "bluetooth", "x y", "中".repeat(200)];
    for (const a of APPS)
      for (const t of ["", ...samples]) {
        const l = buildAppLink(a, t);
        const ok = checkAppAction({ type: "open_app", id: a.id, name: a.name, scheme: l.scheme, web: l.web });
        expect(ok, `${a.id} ${t}`).not.toBeNull();
        expect(ok!.target === "", `${a.id} ${t}`).toBe(!l.targetUsed);
      }
  });
});

describe("checkAppAction (client re-check)", () => {
  const act = (o: Partial<OpenAppAction>): OpenAppAction => ({ type: "open_app", id: "spotify", name: "Spotify", scheme: "spotify:", web: "https://open.spotify.com", ...o });
  it("accepts catalog URLs and filled templates", () => {
    expect(checkAppAction(act({}))).not.toBeNull();
    expect(checkAppAction(act({ scheme: "spotify:search:a%20b", web: "https://open.spotify.com/search/a%20b" }))).not.toBeNull();
    expect(checkAppAction(act({ id: "phone", scheme: "tel:+97699112233", web: "" }))).not.toBeNull();
    expect(checkAppAction(act({ id: "settings", scheme: "x-apple.systempreferences:", web: "" }))).not.toBeNull();
  });
  it.each([
    ["javascript scheme", { scheme: "javascript:alert(1)" }],
    ["other app's scheme", { scheme: "tg://" }],
    ["unsafe chars after template", { scheme: "spotify:search:a\"><script>" }],
    ["unknown id", { id: "evil" }],
    ["web on another host", { web: "https://evil.example/" }],
    ["http web", { web: "http://open.spotify.com" }],
    ["web template with bad chars", { web: "https://open.spotify.com/search/a b" }],
    ["wrong type", { type: "map" as "open_app" }],
    ["USSD code on tel:", { id: "phone", scheme: "tel:*%2306%23", web: "" }],
    ["MMI code on tel:", { id: "phone", scheme: "tel:*2767*3855%23", web: "" }],
    ["settings page outside the list", { id: "settings", scheme: "ms-settings:windowsdefender", web: "" }],
    ["made-up settings page", { id: "settings", scheme: "ms-settings:anything", web: "" }],
    ["extra WhatsApp params", { id: "whatsapp", scheme: "whatsapp://send?phone=12%26text%3Dx", web: "" }],
    ["mailto header injection", { id: "mail", scheme: "mailto:a%3Fcc%3Db%40c.de", web: "" }],
    ["non-canonical encoding", { scheme: "spotify:search:%61", web: "" }],
    ["web carries a different target", { scheme: "spotify:search:queen", web: "https://open.spotify.com/search/abba" }],
    ["web carries a target the app link hides", { scheme: "spotify:", web: "https://open.spotify.com/search/abba" }],
  ])("rejects %s", (_, o) => {
    expect(checkAppAction(act(o))).toBeNull();
  });
  it("returns the decoded target to show", () => {
    expect(checkAppAction(act({ scheme: "spotify:search:a%20b", web: "https://open.spotify.com/search/a%20b" }))?.target).toBe("a b");
    expect(checkAppAction(act({ id: "phone", scheme: "tel:+97699112233", web: "" }))?.target).toBe("+97699112233");
    expect(checkAppAction(act({}))?.target).toBe("");
  });
  it("rejects non-objects", () => {
    expect(checkAppAction(null)).toBeNull();
    expect(checkAppAction("spotify:")).toBeNull();
  });
});

describe("open_app tool", () => {
  it("is exported as appTools", () => {
    expect(appTools.map((t) => t.name)).toEqual(["open_app"]);
    expect(openApp.parameters.required).toEqual(["app", "target"]);
  });

  it("pushes an open_app action and says nothing opened yet", async () => {
    const { out, actions } = await run("телеграм", "@durov_name", "ru");
    expect(actions).toEqual([{ type: "open_app", id: "telegram", name: "Telegram", scheme: "tg://resolve?domain=durov_name", web: "https://t.me/durov_name" }]);
    expect(out.app).toBe("Telegram");
    expect(String(out.note)).toMatch(/do not say it is open/);
    expect(checkAppAction(actions[0])).not.toBeNull();
  });

  it("uses the message language for the name", async () => {
    const { actions } = await run("calculator", "", "de");
    expect(actions[0]).toMatchObject({ id: "calculator", name: "Rechner", scheme: "calculator:" });
  });

  it("reports a dropped target", async () => {
    const { out, actions } = await run("mail", "nobody");
    expect(actions[0].scheme).toBe("mailto:");
    expect(out.targetIgnored).toMatch(/not a valid email/);
  });

  it("unknown app: error with close matches, no card", async () => {
    const { out, actions } = await run("Telegramm Desktop Pro Max");
    expect(actions).toEqual([]);
    expect(out.error).toBeTruthy();
    expect(out.closeMatches).toEqual(expect.any(Array));
    const none = await run("zzqqxx");
    expect(none.out.closeMatches).toEqual([]);
    expect((await run("")).out.error).toBe("app is required");
  });
});

describe("detectPlatform", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0, "mac"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5, "ios"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5, "ios"],
    ["Mozilla/5.0 (Linux; Android 14)", 5, "android"],
    ["Mozilla/5.0 (X11; Linux x86_64)", 0, "linux"],
    ["curl/8", 0, null],
  ])("%s", (ua, tp, p) => {
    expect(detectPlatform(ua, tp)).toBe(p);
  });
});

describe("OpenAppCard", () => {
  const html = (action: OpenAppAction, lang: (typeof LANGS)[number] = "en") => renderToString(createElement(OpenAppCard, { action, lang }));
  const spotify: OpenAppAction = { type: "open_app", id: "spotify", name: "Spotify", scheme: "spotify:search:queen", web: "https://open.spotify.com/search/queen" };

  it("renders the open button and the web fallback, in every language", () => {
    const en = html(spotify);
    expect(en).toContain('href="spotify:search:queen"');
    expect(en).toContain('href="https://open.spotify.com/search/queen"');
    expect(en).toContain("Open Spotify");
    expect(en).toContain('rel="noopener noreferrer"');
    for (const l of LANGS) expect(html(spotify, l)).toContain("Spotify");
    expect(html(spotify, "de")).toContain("Im Web öffnen");
  });

  it("omits the web button when there is none", () => {
    const out = html({ type: "open_app", id: "phone", name: "Phone", scheme: "tel:+97699112233", web: "" });
    expect(out).toContain('href="tel:+97699112233"');
    expect(out).not.toContain("https://");
  });

  it("shows the target baked into the link before the tap", () => {
    const out = html({ type: "open_app", id: "phone", name: "Phone", scheme: "tel:+97699112233", web: "" });
    expect(out).toMatch(/<p[^>]*>\+97699112233<\/p>/);
    expect(html(spotify)).toMatch(/<p[^>]*>queen<\/p>/);
  });

  it("names the app from the catalog, not the action", () => {
    const forged = { ...spotify, name: "Open Bank" };
    expect(html(forged)).not.toContain("Bank");
    expect(() => html({ ...spotify, name: 42 as unknown as string })).not.toThrow();
    expect(html({ type: "open_app", id: "phone", name: "x", scheme: "tel:+97699112233", web: "" }, "ru")).toContain("Телефон");
  });

  it("renders nothing for a URL outside the allow-list", () => {
    expect(html({ ...spotify, scheme: "javascript:alert(1)" })).toBe("");
    expect(html({ ...spotify, web: "https://evil.example/" })).toBe("");
    expect(html({ ...spotify, id: "nope" })).toBe("");
  });
});
