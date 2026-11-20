// Slack: request signatures, bot tokens per workspace, posting, and the OAuth state cookie.
import { createHmac, randomBytes } from "node:crypto";
import { hmac, safeEqual } from "./secure";
import { splitText } from "./split";

export const SLACK_SCOPES = "app_mentions:read,chat:write,im:history,im:read,im:write,commands";
export const SLACK_STATE_COOKIE = "aspire_slack_state";
const SLACK_MAX_TEXT = 3900;
const MAX_SKEW_S = 300;

/** `v0=` HMAC-SHA256 of `v0:<ts>:<body>`; rejects timestamps more than 5 minutes off. */
export function verifySlack(signingSecret: string, timestamp: string, rawBody: string, signature: string, now: Date): boolean {
  if (!signingSecret || !/^\d+$/.test(timestamp) || !signature) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > MAX_SKEW_S) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return safeEqual(expected, signature);
}

// ---------------------------------------------------------------------------
// Bot tokens per workspace. The store is swappable: today the default serves a
// single workspace from SLACK_BOT_TOKEN; the Supabase-backed store (encrypted
// `slack_installations` rows) replaces it with setSlackInstallStore().

export interface SlackInstallation {
  teamId: string;
  botUserId: string;
  botToken: string;
  /** Aspire user who installed it, when known. */
  installedBy: string | null;
}

export interface SlackInstallStore {
  get(teamId: string): Promise<string | null>;
  put(install: SlackInstallation): Promise<void>;
  delete(teamId: string): Promise<void>;
}

/** Single-workspace fallback: one token from the environment for every team; nothing is persisted. */
export const envInstallStore: SlackInstallStore = {
  async get() {
    return process.env.SLACK_BOT_TOKEN || null;
  },
  async put() {
    // Nothing to store: the single-workspace token lives in SLACK_BOT_TOKEN.
  },
  async delete() {
    // Nothing to delete.
  },
};

let store: SlackInstallStore = envInstallStore;

export function slackInstallStore(): SlackInstallStore {
  return store;
}
export function setSlackInstallStore(next: SlackInstallStore): void {
  store = next;
}

export function getSlackToken(teamId: string): Promise<string | null> {
  return store.get(teamId);
}

// ---------------------------------------------------------------------------
// Web API

interface SlackResult {
  ok: boolean;
  error?: string;
}

export async function slackApi<T extends SlackResult>(token: string, method: string, body: object): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error(`Slack ${method}: network error`);
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || !data?.ok) throw new Error(`Slack ${method} failed (${res.status}): ${String(data?.error ?? "").slice(0, 100)}`);
  return data;
}

/** chat.postMessage, optionally into a thread; long text goes out as several messages. */
export async function slackPost(token: string, channel: string, text: string, threadTs?: string): Promise<void> {
  for (const chunk of splitText(text, SLACK_MAX_TEXT)) {
    await slackApi(token, "chat.postMessage", {
      channel,
      text: chunk,
      unfurl_links: false,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });
  }
}

/** Reply to a slash command through its response_url (only Slack's own hooks host is accepted). */
export async function slackRespond(responseUrl: string, body: object): Promise<void> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) throw new Error("Slack response_url is not a Slack URL");
  const res = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error("Slack response_url: network error");
  });
  if (!res.ok) throw new Error(`Slack response_url failed (${res.status})`);
}

/** Slack escapes &, < and > in message text, and writes mentions as <@U123>. */
export function cleanSlackText(text: string, botUserId?: string): string {
  let t = text;
  if (botUserId && /^[A-Z0-9]+$/.test(botUserId)) t = t.replace(new RegExp(`<@${botUserId}(?:\\|[^>]*)?>`, "g"), " ");
  t = t.replace(/^\s*<@[A-Z0-9]+(?:\|[^>]*)?>/, " ");
  return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// OAuth "state": a random nonce sent to Slack, plus a signed cookie holding the
// same nonce and its time, so the callback can prove it started here (CSRF).

const STATE_TTL_MS = 10 * 60_000;

export function newOAuthState(secret: string, now = new Date()): { state: string; cookie: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${nonce}.${now.getTime()}`;
  return { state: nonce, cookie: `${payload}.${hmac(secret, payload)}` };
}

export function checkOAuthState(secret: string, state: string, cookie: string, now = new Date()): boolean {
  const [nonce, ts, sig, extra] = cookie.split(".");
  if (!secret || !state || !nonce || !ts || !sig || extra !== undefined) return false;
  if (!safeEqual(sig, hmac(secret, `${nonce}.${ts}`))) return false;
  const age = now.getTime() - Number(ts);
  return safeEqual(nonce, state) && age >= 0 && age <= STATE_TTL_MS;
}

export function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

/** Public base URL of the app (NEXT_PUBLIC_SITE_URL, else the request's origin). */
export function siteUrl(req: Request): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, "");
}
