// Web Push for reminders that ring while Aspire is closed. Server only.
// Encryption is RFC 8291 (aes128gcm) and sign-in to the push service is VAPID (RFC 8292), both
// with node:crypto, so there is no dependency. Endpoints are accepted only on the four browser
// push services (no SSRF), keys must be a real P-256 point, and a subscription the service refuses
// (400/403/404/410) or whose key cannot encrypt is dropped.
// Env: NEXT_PUBLIC_VAPID_PUBLIC_KEY (65-byte P-256 point, base64url), VAPID_PRIVATE_KEY (32 bytes,
// base64url, server only), VAPID_SUBJECT (mailto: or https:, optional: the site URL).
import "server-only";
import { createCipheriv, createECDH, createHmac, createPrivateKey, ECDH, sign, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { botText } from "@/lib/bots/text";
import { isLang, type Lang } from "@/lib/lang";
import { SITE_URL, UA } from "@/lib/site";

/** Chrome/Android (FCM), Firefox (Mozilla autopush), Edge (WNS) and Safari/iOS (Apple). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^[a-z0-9-]+\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];
export const MAX_SUBSCRIPTIONS = 5;
const TABLE = "push_subscriptions";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** True when `b` is a point on P-256 (an off-curve key would make every send fail locally). */
const onCurve = (b: Buffer): boolean => {
  try {
    ECDH.convertKey(b, "prime256v1");
    return true;
  } catch {
    return false;
  }
};

/** base64url text that decodes to exactly `bytes` bytes, or null. */
function b64u(v: unknown, bytes: number): Buffer | null {
  if (typeof v !== "string" || v.length > 200 || !/^[A-Za-z0-9_-]+={0,2}$/.test(v)) return null;
  const b = Buffer.from(v, "base64url");
  return b.length === bytes ? b : null;
}

/** Trust boundary: an https URL on a browser push service (default port, no credentials), normalised; else null. */
export function pushEndpoint(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1024) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && PUSH_HOSTS.some((h) => h.test(u.hostname)) ? u.href : null;
  } catch {
    return null;
  }
}

/** Trust boundary: a browser PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }), or null. */
export function parseSubscription(v: unknown): PushSub | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s !== "object") return null;
  const endpoint = pushEndpoint(s.endpoint);
  const p256dh = b64u(s.keys?.p256dh, 65);
  const auth = b64u(s.keys?.auth, 16);
  if (!endpoint || !p256dh || p256dh[0] !== 4 || !onCurve(p256dh) || !auth) return null;
  return { endpoint, p256dh: p256dh.toString("base64url"), auth: auth.toString("base64url") };
}

function vapidKeys(): { pub: Buffer; d: Buffer } | null {
  const pub = b64u(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, 65);
  const d = b64u(process.env.VAPID_PRIVATE_KEY, 32);
  return pub && d && pub[0] === 4 ? { pub, d } : null;
}

export const pushConfigured = (): boolean => vapidKeys() !== null;

const hmac = (key: Buffer, ...data: Buffer[]) => {
  const h = createHmac("sha256", key);
  for (const d of data) h.update(d);
  return h.digest();
};

/** RFC 8291 aes128gcm body: one record, salt and the sender's public key in the header. `as`/`salt` are for tests. */
export function encryptPayload(payload: Buffer, uaPublic: Buffer, authSecret: Buffer, sender?: ECDH, salt: Buffer = randomBytes(16)): Buffer {
  const as = sender ?? createECDH("prime256v1");
  if (!sender) as.generateKeys();
  const asPublic = as.getPublicKey();
  const prkKey = hmac(authSecret, as.computeSecret(uaPublic));
  const ikm = hmac(prkKey, Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic, Buffer.from([1]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(0, 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, sealed]);
}

/** VAPID Authorization header for one push service origin, valid 12 hours. */
export function vapidAuthorization(endpoint: string, now = Date.now()): string | null {
  const keys = vapidKeys();
  if (!keys) return null;
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.d.toString("base64url"), x: keys.pub.subarray(1, 33).toString("base64url"), y: keys.pub.subarray(33).toString("base64url") },
    format: "jwk",
  });
  const sub = process.env.VAPID_SUBJECT && /^(mailto:|https:\/\/)/.test(process.env.VAPID_SUBJECT) ? process.env.VAPID_SUBJECT : SITE_URL;
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub })}`;
  const sig = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `vapid t=${unsigned}.${sig}, k=${keys.pub.toString("base64url")}`;
}

/** Shown instead of the reminder when the person hid reminder text on the lock screen. */
const HIDDEN: Record<Lang, string> = {
  mn: "Танд сануулга ирлээ. Aspire-г нээж харна уу.",
  zh: "您有一条提醒。请打开 Aspire 查看。",
  en: "You have a reminder. Open Aspire to see it.",
  ru: "У вас напоминание. Откройте Aspire, чтобы его увидеть.",
  de: "Sie haben eine Erinnerung. Öffnen Sie Aspire, um sie zu sehen.",
};

/** One push. "gone": the subscription can never work (refused with 400/403/404/410, or its key cannot encrypt). Never follows redirects. */
export async function sendPush(sub: PushSub, message: { title: string; body: string; tag: string }): Promise<"sent" | "gone" | "failed"> {
  const endpoint = pushEndpoint(sub.endpoint);
  const ua = b64u(sub.p256dh, 65);
  const secret = b64u(sub.auth, 16);
  const auth = endpoint && vapidAuthorization(endpoint);
  if (!endpoint || !ua || !secret || !auth) return "failed";
  let body: Buffer;
  try {
    body = encryptPayload(Buffer.from(JSON.stringify(message)), ua, secret);
  } catch {
    return "gone";
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: auth, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "3600", Urgency: "high", "User-Agent": UA },
      body: new Uint8Array(body),
    });
    return [400, 403, 404, 410].includes(res.status) ? "gone" : res.status >= 200 && res.status < 300 ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Sends a due reminder to every device the person turned notifications on for. Returns how many
 * took it (0 = not delivered: the caller retries). Dead subscriptions are deleted.
 */
export async function deliverPush(db: SupabaseClient, userId: string, reminder: { id: string; text: string }): Promise<number> {
  if (!pushConfigured()) return 0;
  const { data, error } = await db.from(TABLE).select("endpoint, p256dh, auth, lang, hide_text").eq("user_id", userId).limit(MAX_SUBSCRIPTIONS);
  if (error) throw new Error(`push select ${error.code ?? ""}`);
  // All devices at once, so one slow push service costs one timeout, not five.
  const results = await Promise.all(
    ((data ?? []) as (PushSub & { lang: string; hide_text: boolean })[]).map(async (row) => {
      const lang: Lang = isLang(row.lang) ? row.lang : "en";
      const body = row.hide_text ? HIDDEN[lang] : `${botText(lang).reminder}: ${reminder.text}`.slice(0, 500);
      const r = await sendPush(row, { title: "Aspire", body, tag: `r-${reminder.id}`.slice(0, 64) });
      if (r === "gone") await db.from(TABLE).delete().eq("user_id", userId).eq("endpoint", row.endpoint);
      return r;
    }),
  );
  return results.filter((r) => r === "sent").length;
}

/** True when the person has at least one device with notifications on (their reminders then go to the cloud). */
export async function hasPushSubscription(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from(TABLE).select("endpoint").eq("user_id", userId).limit(1);
  return !error && !!(data as unknown[] | null)?.length;
}
