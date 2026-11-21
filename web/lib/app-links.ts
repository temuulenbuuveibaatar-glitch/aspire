// "Open Spotify / VS Code / Settings ...": a curated allow-list of apps the web can launch with a
// URL scheme, no install. Shared by the open_app tool (server) and OpenAppCard (client), so the
// card can re-check every URL against this list before it reaches the DOM.
import type { Lang } from "@/lib/lang";

export type Platform = "windows" | "mac" | "linux" | "android" | "ios";
export const PLATFORM_NAMES: Record<Platform, string> = { windows: "Windows", mac: "macOS", linux: "Linux", android: "Android", ios: "iOS" };

/** What a target means for an app: search text, an email, a phone (+ kept / digits only), a username, a settings page. */
export type TargetKind = "query" | "email" | "phone" | "digits" | "username" | "settings";

export interface AppLink {
  id: string;
  /** Brand name (most apps keep it in every language). */
  name: string;
  /** Display name per language when it differs from `name` (Settings, Calculator ...). */
  local?: Partial<Record<Lang, string>>;
  /** More names people say, in any of the 5 languages. */
  aliases: string[];
  /** URL the "Open" button uses. */
  scheme: string;
  /** macOS scheme when `scheme` is Windows-only (Settings). */
  mac?: string;
  /** https fallback; "" = none. */
  web: string;
  platforms: Platform[];
  /** Deep link with a target; `{q}` is replaced by the checked, encoded target. web "" = keep `web`. */
  target?: { kind: TargetKind; scheme: string; web: string };
}

const DESK: Platform[] = ["windows", "mac", "linux"];
const MOBILE: Platform[] = ["android", "ios"];
const ALL: Platform[] = [...DESK, ...MOBILE];

const app = (id: string, name: string, scheme: string, web: string, platforms: Platform[], aliases: string[] = [], extra: Partial<AppLink> = {}): AppLink => ({
  id, name, scheme, web, platforms, aliases, ...extra,
});

export const APPS: readonly AppLink[] = [
  app("spotify", "Spotify", "spotify:", "https://open.spotify.com", ALL, ["спотифай", "спотифи", "声田"], {
    target: { kind: "query", scheme: "spotify:search:{q}", web: "https://open.spotify.com/search/{q}" },
  }),
  app("vscode", "VS Code", "vscode://", "https://vscode.dev", DESK, ["visual studio code", "vscode", "code", "вс код", "вскод"]),
  app("telegram", "Telegram", "tg://", "https://web.telegram.org", ALL, ["телеграм", "телеграмм", "电报", "tg"], {
    target: { kind: "username", scheme: "tg://resolve?domain={q}", web: "https://t.me/{q}" },
  }),
  app("discord", "Discord", "discord://", "https://discord.com/app", ALL, ["дискорд"]),
  app("slack", "Slack", "slack://open", "https://app.slack.com", ALL, ["слак", "слэк"]),
  app("zoom", "Zoom", "zoommtg://", "https://zoom.us/join", ALL, ["зум"]),
  app("teams", "Microsoft Teams", "msteams:", "https://teams.microsoft.com", ALL, ["teams", "ms teams", "тимс", "тимз"]),
  app("whatsapp", "WhatsApp", "whatsapp://", "https://web.whatsapp.com", ALL, ["whats app", "ватсап", "вотсап", "вацап"], {
    target: { kind: "digits", scheme: "whatsapp://send?phone={q}", web: "https://wa.me/{q}" },
  }),
  app("signal", "Signal", "sgnl://", "https://signal.org", ALL, ["сигнал"]),
  app("viber", "Viber", "viber://", "https://www.viber.com", ALL, ["вайбер"]),
  app("wechat", "WeChat", "weixin://", "https://web.wechat.com", ALL, ["微信", "weixin", "вичат"]),
  app("line", "LINE", "line://", "https://line.me", ALL),
  app("messenger", "Messenger", "fb-messenger://", "https://www.messenger.com", ALL, ["facebook messenger", "мессенжер", "мессенджер"]),
  app("steam", "Steam", "steam://open/main", "https://store.steampowered.com", DESK, ["стим"]),
  app("notion", "Notion", "notion://", "https://www.notion.so", ALL, ["ноушн", "ношн"]),
  app("obsidian", "Obsidian", "obsidian://", "https://obsidian.md", ALL, ["обсидиан"]),
  app("figma", "Figma", "figma://", "https://www.figma.com/files", ALL, ["фигма"]),
  app("trello", "Trello", "trello://", "https://trello.com", ALL, ["трелло"]),
  app("github", "GitHub Desktop", "x-github-client://", "https://github.com", ["windows", "mac"], ["github", "гитхаб"]),
  app("claude", "Claude", "claude://", "https://claude.ai", ALL, ["клод"]),
  app("mail", "Mail", "mailto:", "https://mail.google.com", ALL, ["email", "e-mail", "gmail", "имэйл", "мэйл", "шуудан", "邮件", "邮箱", "почта", "почту", "емейл"], {
    local: { mn: "Имэйл", zh: "邮件", ru: "Почта", de: "E-Mail" },
    target: { kind: "email", scheme: "mailto:{q}", web: "https://mail.google.com/mail/?view=cm&to={q}" },
  }),
  app("outlook", "Outlook", "ms-outlook:", "https://outlook.live.com", ALL, ["аутлук"]),
  app("word", "Microsoft Word", "ms-word:", "https://www.office.com/launch/word", ALL, ["word", "ворд"]),
  app("excel", "Microsoft Excel", "ms-excel:", "https://www.office.com/launch/excel", ALL, ["excel", "эксель", "ексель"]),
  app("powerpoint", "Microsoft PowerPoint", "ms-powerpoint:", "https://www.office.com/launch/powerpoint", ALL, ["powerpoint", "power point", "ppt", "поверпоинт"]),
  app("onenote", "OneNote", "onenote:", "https://www.onenote.com", ALL, ["one note", "ваннот"]),
  app("phone", "Phone", "tel:", "", MOBILE, ["dialer", "утас", "电话", "телефон", "telefon"], {
    local: { mn: "Утас", zh: "电话", ru: "Телефон", de: "Telefon" },
    target: { kind: "phone", scheme: "tel:{q}", web: "" },
  }),
  app("settings", "Settings", "ms-settings:", "", ["windows", "mac"], ["system settings", "system preferences", "control panel", "тохиргоо", "设置", "настройки", "параметры", "einstellungen", "systemeinstellungen"], {
    local: { mn: "Тохиргоо", zh: "设置", ru: "Настройки", de: "Einstellungen" },
    mac: "x-apple.systempreferences:",
    target: { kind: "settings", scheme: "ms-settings:{q}", web: "" },
  }),
  app("calculator", "Calculator", "calculator:", "https://www.google.com/search?q=calculator", ["windows"], ["calc", "тооны машин", "тооцоолуур", "计算器", "калькулятор", "rechner", "taschenrechner"], {
    local: { mn: "Тооны машин", zh: "计算器", ru: "Калькулятор", de: "Rechner" },
  }),
  app("calendar", "Calendar", "outlookcal:", "https://calendar.google.com", ["windows"], ["google calendar", "хуанли", "日历", "календарь", "kalender"], {
    local: { mn: "Хуанли", zh: "日历", ru: "Календарь", de: "Kalender" },
  }),
  app("youtube", "YouTube", "youtube://", "https://www.youtube.com", MOBILE, ["ютуб", "ютюб", "油管"], {
    target: { kind: "query", scheme: "youtube://results?search_query={q}", web: "https://www.youtube.com/results?search_query={q}" },
  }),
  app("netflix", "Netflix", "nflx://", "https://www.netflix.com", MOBILE, ["нетфликс", "网飞"]),
  app("twitch", "Twitch", "twitch://", "https://www.twitch.tv", MOBILE, ["твич"]),
  app("instagram", "Instagram", "instagram://", "https://www.instagram.com", MOBILE, ["insta", "ig", "инстаграм", "инста"]),
  app("facebook", "Facebook", "fb://", "https://www.facebook.com", MOBILE, ["fb", "фэйсбүүк", "фейсбук", "фэйсбук", "脸书"]),
  app("x", "X", "twitter://", "https://x.com", MOBILE, ["twitter", "твиттер", "推特"]),
  app("tiktok", "TikTok", "tiktok://", "https://www.tiktok.com", MOBILE, ["tik tok", "тикток"]),
  app("linkedin", "LinkedIn", "linkedin://", "https://www.linkedin.com", MOBILE, ["линкедин", "领英"]),
  app("reddit", "Reddit", "reddit://", "https://www.reddit.com", MOBILE, ["реддит", "редит"]),
  app("apple-music", "Apple Music", "music://", "https://music.apple.com", ["mac", "ios"], ["itunes", "эпл мьюзик"]),
  app("google-maps", "Google Maps", "comgooglemaps://", "https://www.google.com/maps", ["ios"], ["maps", "гугл карт", "google карты", "谷歌地图"], {
    target: { kind: "query", scheme: "comgooglemaps://?q={q}", web: "https://www.google.com/maps/search/?api=1&query={q}" },
  }),
];

const BY_ID = new Map(APPS.map((a) => [a.id, a]));
export const appById = (id: unknown): AppLink | undefined => (typeof id === "string" ? BY_ID.get(id) : undefined);
export const appName = (a: AppLink, lang: Lang): string => a.local?.[lang] ?? a.name;

/** Windows Settings pages people ask for (ms-settings:<page>). Keys are English words. */
export const SETTINGS_PAGES: Record<string, string> = {
  bluetooth: "bluetooth", wifi: "network-wifi", network: "network", vpn: "network-vpn", display: "display",
  sound: "sound", notifications: "notifications", battery: "batterysaver", power: "powersleep", apps: "appsfeatures",
  update: "windowsupdate", privacy: "privacy", location: "privacy-location", camera: "privacy-webcam",
  microphone: "privacy-microphone", language: "regionlanguage", time: "dateandtime", personalization: "personalization",
  mouse: "mousetouchpad", keyboard: "typing", storage: "storagesense", printers: "printers",
};

// Conservative address charset: no ?, &, =, #, %, / or quotes, so a target cannot add mailto headers.
const EMAIL = /^[\p{L}\p{N}._+-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u;
/** Longest encoded target; the server and the client re-check use the same bound. */
const MAX_ENCODED = 700;
const capped = (e: string) => (e.length <= MAX_ENCODED ? e : null);

/** The target as it goes into `{q}`, or null if it is not valid for this kind. */
export function encodeTarget(kind: TargetKind, raw: string): string | null {
  const t = raw.trim();
  if (!t || t.length > 200) return null;
  switch (kind) {
    case "query":
      return capped(encodeURIComponent(t));
    case "email":
      return EMAIL.test(t) ? capped(encodeURIComponent(t)) : null;
    case "phone":
    case "digits": {
      if (!/^\+?[\d\s().-]+$/.test(t)) return null;
      const digits = t.replace(/\D/g, "");
      if (digits.length < 3 || digits.length > 15) return null;
      return kind === "phone" && t.startsWith("+") ? `+${digits}` : digits;
    }
    case "username": {
      const u = t.replace(/^@/, "");
      return /^[A-Za-z0-9_]{5,32}$/.test(u) ? u : null;
    }
    case "settings":
      return SETTINGS_PAGES[t.toLowerCase().replace(/[^a-z]/g, "")] ?? null;
  }
}

/** The URLs for this app, with `target` filled in when it fits. targetError says why a target was dropped. */
export function buildAppLink(a: AppLink, target = ""): { scheme: string; web: string; targetUsed: boolean; targetError?: string } {
  const plain = { scheme: a.scheme, web: a.web, targetUsed: false };
  if (!target.trim()) return plain;
  if (!a.target) return { ...plain, targetError: `${a.name} does not take a target; it opens on its start screen` };
  const q = encodeTarget(a.target.kind, target);
  if (q === null) return { ...plain, targetError: `"${target.slice(0, 60)}" is not a valid ${a.target.kind} for ${a.name}` };
  return { scheme: a.target.scheme.replace("{q}", q), web: a.target.web ? a.target.web.replace("{q}", q) : a.web, targetUsed: true };
}

// What may follow a template prefix: only characters encodeTarget can produce (a cheap first gate).
const FILLED = new RegExp(`^[A-Za-z0-9\\-_.!~*'()%+]{1,${MAX_ENCODED}}$`);
const PAGES = new Set(Object.values(SETTINGS_PAGES));

/**
 * The target baked into `url` ("" for an exact catalog URL), or null if the URL is not this app's.
 * A filled template must hold exactly what encodeTarget would have produced for that kind.
 */
function filled(url: string, exact: (string | undefined)[], tpl: AppLink["target"] | undefined, which: "scheme" | "web"): string | null {
  if (exact.includes(url)) return "";
  const template = tpl?.[which];
  if (!tpl || !template) return null;
  const p = template.slice(0, template.indexOf("{q}"));
  const s = url.slice(p.length);
  if (!url.startsWith(p) || !FILLED.test(s)) return null;
  if (tpl.kind === "settings") return PAGES.has(s) ? s : null;
  let d: string;
  try {
    d = decodeURIComponent(s);
  } catch {
    return null;
  }
  return encodeTarget(tpl.kind, d) === s ? d : null;
}

/**
 * Client-side re-check of an open_app action: the app must be in the list and both URLs must be
 * that app's own (plain, or its target template re-validated for the target kind), carrying the
 * same target. Returns the decoded target to show before the tap ("" = none). Anything else is null.
 */
export function checkAppAction(action: unknown): { app: AppLink; scheme: string; web: string; target: string } | null {
  if (!action || typeof action !== "object") return null;
  const { type, id, scheme, web } = action as Record<string, unknown>;
  const a = appById(id);
  if (type !== "open_app" || !a || typeof scheme !== "string" || typeof web !== "string") return null;
  const target = filled(scheme, [a.scheme, a.mac], a.target, "scheme");
  if (target === null) return null;
  if (web !== "") {
    if (!web.startsWith("https://")) return null;
    const onWeb = filled(web, [a.web], a.target, "web");
    // With a web template, the web link must carry the same target as the app link.
    if (onWeb === null || (a.target?.web && onWeb !== target)) return null;
  }
  return { app: a, scheme, web, target };
}

// Matching: case, punctuation and filler words ("open", "app", "открой", "нээ", "打开" ...) ignored.
const FILLER = new Set([
  "open", "launch", "start", "run", "app", "application", "the", "my", "please",
  "нээ", "нээх", "нээгээч", "нээж", "өгөөч", "апп", "аппликейшн", "програм", "программ",
  "открой", "откройте", "открыть", "запусти", "запустить", "приложение", "программу",
  "öffne", "öffnen", "starte", "starten", "die", "den", "das", "bitte",
]);
const ZH_FILLER = /打开|启动|开启|应用|程序|请|一下/g;
const CJK = /[぀-ヿ㐀-鿿]/;

export function normalizeAppQuery(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(ZH_FILLER, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !FILLER.has(w))
    .join(" ");
}

function lev(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** 0..1: how well a normalized query matches one normalized alias. */
function score(q: string, alias: string): number {
  const qc = q.replace(/ /g, ""), ac = alias.replace(/ /g, "");
  if (!qc || !ac) return 0;
  if (qc === ac) return 1;
  if (ac.length >= 2 && (` ${q} `.includes(` ${alias} `) || (CJK.test(ac) && qc.includes(ac)))) return 0.7 + (0.25 * ac.length) / qc.length;
  if (qc.length >= 3 && ac.startsWith(qc)) return 0.5 + (0.3 * qc.length) / ac.length; // a short prefix ("cal") stays a suggestion
  if (qc.length < 3 || ac.length < 3) return 0;
  // Typos resolve only on long names with the same first letter ("spotfy"); short ones ("team" vs
  // steam, "room" vs zoom) stay suggestions, so a real word never opens the wrong app.
  const s = 1 - lev(qc, ac) / Math.max(qc.length, ac.length);
  return Math.min(qc.length, ac.length) >= 6 && qc[0] === ac[0] ? s : Math.min(s, 0.6);
}

const ALIASES = APPS.map((a) => ({ app: a, names: [a.name, a.id, ...Object.values(a.local ?? {}), ...a.aliases].map(normalizeAppQuery) }));

function ranked(query: string): { app: AppLink; score: number }[] {
  const q = normalizeAppQuery(query.slice(0, 80));
  if (!q) return [];
  return ALIASES.map(({ app: a, names }) => ({ app: a, score: Math.max(...names.map((n) => score(q, n))) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);
}

const RESOLVE_AT = 0.75;

/** The allow-listed app the person means, or null. `name` is in `lang`. */
export function resolveApp(query: string, lang: Lang): { app: AppLink; name: string } | null {
  const [best] = ranked(query);
  return best && best.score >= RESOLVE_AT ? { app: best.app, name: appName(best.app, lang) } : null;
}

/** Up to `n` near matches (names in `lang`) for an unknown app. */
export function closeApps(query: string, lang: Lang, n = 5): string[] {
  return ranked(query).filter((r) => r.score >= 0.4).slice(0, n).map((r) => appName(r.app, lang));
}

/** The device family from a user agent; null if unknown. iPadOS reports "Macintosh" with touch. */
export function detectPlatform(ua: string, touchPoints = 0): Platform | null {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Linux|CrOS/.test(ua)) return "linux";
  return null;
}
