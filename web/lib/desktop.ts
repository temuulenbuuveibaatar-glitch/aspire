// Aspire Desktop: a helper app on the person's computer (repo folder desktop/) that does small
// things there (open an app or a link, type text, save a file, fill a form). Server only.
//
// Pairing: the signed-in person gets a one-time 10-character code (10 minutes) that the helper
// trades for a long random device token. The code is long because the pair route is open to
// anyone. Only SHA-256 hashes of codes and tokens are stored. A job is queued for the person's
// most recently seen device, handed to that device once, and runs only after the person types
// "y" in the helper. Jobs expire after 5 minutes. A finished job loses its payload (typed text,
// file content) at once. A waiting job past its 5 minutes loses it when its device polls or when
// anyone queues a job (that cleans up every user's jobs); all job rows go after 24 hours.
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export const DESKTOP_CODE_TTL_MS = 10 * 60_000;
export const DESKTOP_JOB_TTL_MS = 5 * 60_000;
export const DESKTOP_TEXT_MAX = 2000;
export const DESKTOP_FILE_MAX_BYTES = 200 * 1024;
const FORM_FIELDS_MAX = 20;
const QUEUED_MAX = 10;
const LAST_SEEN_EVERY_MS = 60_000;
const KEEP_JOBS_MS = 24 * 3600_000;

export const DESKTOP_KINDS = ["open_app", "open_url", "type_text", "save_file", "fill_form"] as const;
export type DesktopKind = (typeof DESKTOP_KINDS)[number];
export type DesktopStatus = "queued" | "sent" | "done" | "denied" | "failed" | "expired";
export type DesktopOutcome = Extract<DesktopStatus, "done" | "denied" | "failed" | "expired">;

export type DesktopPayload =
  | { app: string }
  | { url: string }
  | { text: string }
  | { name: string; content: string }
  | { fields: { label: string; value: string }[] };

export interface DesktopDevice {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastSeen: string;
}

/** What the helper receives from GET /api/desktop/next. */
export interface DesktopJob {
  id: string;
  kind: DesktopKind;
  payload: DesktopPayload;
  createdAt: string;
  expiresAt: string;
  /** Time left by the server's clock; the helper keeps its deadline on its own clock (clock skew). */
  expiresInMs: number;
}

interface DeviceRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  last_seen: string;
}

interface JobRow {
  id: string;
  kind: DesktopKind;
  payload: DesktopPayload;
  created_at: string;
}

const toDevice = (r: DeviceRow): DesktopDevice => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  createdAt: r.created_at,
  lastSeen: r.last_seen,
});

function fail(what: string, error: { code?: string } | null): never {
  throw new Error(`desktop ${what} failed (${error?.code ?? "unknown"})`);
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Pairing-code letters: no I, L, O, 0 or 1, which look alike. 31 characters, 10 per code (about 8e14 codes). */
export const DESKTOP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const DESKTOP_CODE_LENGTH = 10;
export const DESKTOP_CODE_RE = /^[A-HJKMNP-Z2-9]{10}$/;
/** A typed code in canonical form: upper case, no spaces or dashes ("abcde-fghjk" -> "ABCDEFGHJK"). */
export const normalizeDesktopCode = (v: unknown): string =>
  typeof v === "string" ? v.slice(0, 64).toUpperCase().replace(/[\s-]+/g, "") : "";
/** A random code in this alphabet (also used for chat link codes, lib/bots/links.ts). */
export const newDesktopCode = (): string =>
  Array.from({ length: DESKTOP_CODE_LENGTH }, () => DESKTOP_CODE_ALPHABET[randomInt(DESKTOP_CODE_ALPHABET.length)]).join("");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The device token from `Authorization: Bearer <token>`, or null when missing or malformed. */
export function bearerToken(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------------------------
// Validation (trust boundary: tool input from the model, device names and results from helpers)

// Control characters (tab and newline kept), DEL, C1 controls, bidi marks and overrides,
// zero-width characters, line/paragraph separators and BOM, which could make the text the
// person reads in the helper differ from what would be typed. Same set in desktop/escape.mjs.
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
/** Normalised newlines, no control, bidi or invisible characters. */
export const cleanText = (s: string): string => s.replace(/\r\n?/g, "\n").replace(UNSAFE, "");

const APP_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._+&'-]{0,79}$/u;
const FILE_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,99}$/u;
const RESERVED_FILE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\s*\..*)?$/i;
/** Plain text types only: no shortcuts (.url .scf .lnk), scripts or programs. */
const TEXT_EXT = /\.(txt|md|csv|tsv|json|log|ics|vcf)$/i;

/** A plain text file name (notes.txt): letters, digits, space . _ ( ) -, no path, no Windows device names. */
export function isSafeFileName(name: string): boolean {
  return FILE_RE.test(name) && TEXT_EXT.test(name) && !name.includes("..") && !RESERVED_FILE.test(name);
}

/** An https URL without credentials, normalised, or null. */
export function httpsUrl(raw: string): string | null {
  if (raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Text from the model; a finite number (an age, a phone number) becomes its digits. */
const s = (v: unknown): string =>
  typeof v === "string" ? cleanText(v) : typeof v === "number" && Number.isFinite(v) ? String(v) : "";

/** Checks a job's input and returns the payload to store, or an error for the model. */
export function validateDesktopJob(
  kind: unknown,
  input: Record<string, unknown>,
): { kind: DesktopKind; payload: DesktopPayload } | { error: string } {
  switch (kind) {
    case "open_app": {
      const app = s(input.app).trim();
      if (!APP_RE.test(app)) return { error: "app must be an app name (letters, digits, spaces), up to 80 characters" };
      return { kind, payload: { app } };
    }
    case "open_url": {
      const url = httpsUrl(s(input.url).trim());
      if (!url) return { error: "url must be a full https:// address" };
      return { kind, payload: { url } };
    }
    case "type_text": {
      const text = s(input.text);
      if (!text.trim()) return { error: "text is required" };
      if (text.length > DESKTOP_TEXT_MAX) return { error: `text is longer than ${DESKTOP_TEXT_MAX} characters` };
      return { kind, payload: { text } };
    }
    case "save_file": {
      const name = s(input.name).trim();
      if (!isSafeFileName(name)) return { error: "name must be a plain text file name like notes.txt (.txt .md .csv .tsv .json .log .ics .vcf), no folders" };
      if (typeof input.content !== "string") return { error: "content is required" };
      if (Buffer.byteLength(input.content, "utf8") > DESKTOP_FILE_MAX_BYTES) return { error: "content is larger than 200 KB" };
      return { kind, payload: { name, content: input.content } };
    }
    case "fill_form": {
      const raw = Array.isArray(input.fields) ? input.fields : [];
      if (!raw.length || raw.length > FORM_FIELDS_MAX) return { error: `fields must have 1 to ${FORM_FIELDS_MAX} entries` };
      const fields: { label: string; value: string }[] = [];
      for (const f of raw) {
        const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        const label = s(o.label).trim().slice(0, 100);
        // A tab or newline inside a value would jump to another field.
        const value = s(o.value).replace(/[\t\n]+/g, " ").trim();
        if (!label) return { error: "every field needs a label" };
        if (value.length > 500) return { error: "a field value is longer than 500 characters" };
        fields.push({ label, value });
      }
      if (fields.reduce((n, f) => n + f.value.length, 0) > DESKTOP_TEXT_MAX) return { error: "the values are too long in total" };
      return { kind, payload: { fields } };
    }
    default:
      return { error: "unknown desktop job" };
  }
}

/** A device name for the list in Settings ("Computer" when nothing usable is given). */
export function cleanDeviceName(v: unknown): string {
  const name = s(v).replace(/[^\p{L}\p{N} ._'()-]/gu, "").trim().slice(0, 60);
  return name || "Computer";
}

// ---------------------------------------------------------------------------------------------
// Pairing

/** A fresh pairing code for this person (their older codes stop working). */
export async function createDesktopCode(userId: string, now = new Date()): Promise<string> {
  const db = supabaseAdmin();
  await db.from("desktop_codes").delete().eq("user_id", userId);
  await db.from("desktop_codes").delete().lt("expires_at", now.toISOString());
  const expires_at = new Date(now.getTime() + DESKTOP_CODE_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newDesktopCode();
    const { error } = await db.from("desktop_codes").insert({ code_hash: sha256(code), user_id: userId, expires_at });
    if (!error) return code;
    if (error.code !== "23505") fail("code", error);
  }
  throw new Error("desktop code failed (no free code)");
}

/**
 * Trade a code for a device token (the code works once). A device of the same name replaces the
 * person's older one (pairing the same computer again). Null when the code is unknown or expired.
 */
export async function pairDesktop(
  code: string,
  deviceName: string,
  now = new Date(),
): Promise<{ token: string; device: DesktopDevice } | null> {
  if (!DESKTOP_CODE_RE.test(code)) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.from("desktop_codes").delete().eq("code_hash", sha256(code)).select("user_id, expires_at");
  if (error) fail("pair", error);
  const row = (data as { user_id: string; expires_at: string }[] | null)?.[0];
  if (!row || Date.parse(row.expires_at) <= now.getTime()) return null;

  const name = cleanDeviceName(deviceName);
  const { error: e1 } = await db.from("desktop_devices").delete().eq("user_id", row.user_id).eq("name", name);
  if (e1) fail("pair", e1);
  const token = randomBytes(32).toString("base64url");
  const at = now.toISOString();
  const device: DeviceRow = { id: randomUUID(), user_id: row.user_id, name, created_at: at, last_seen: at };
  const { error: e2 } = await db.from("desktop_devices").insert({ ...device, token_hash: sha256(token) });
  if (e2) fail("pair", e2);
  return { token, device: toDevice(device) };
}

/** The device a token belongs to (and marks it seen), or null. */
export async function deviceFromToken(token: string | null, now = new Date()): Promise<DesktopDevice | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const db = supabaseAdmin();
  const { data, error } = await db.from("desktop_devices").select("*").eq("token_hash", sha256(token)).limit(1);
  if (error) fail("auth", error);
  const row = ((data ?? []) as DeviceRow[])[0];
  if (!row) return null;
  if (now.getTime() - Date.parse(row.last_seen) > LAST_SEEN_EVERY_MS) {
    row.last_seen = now.toISOString();
    await db.from("desktop_devices").update({ last_seen: row.last_seen }).eq("id", row.id);
  }
  return toDevice(row);
}

export async function listDesktopDevices(userId: string): Promise<DesktopDevice[]> {
  const { data, error } = await supabaseAdmin()
    .from("desktop_devices")
    .select("id, user_id, name, created_at, last_seen")
    .eq("user_id", userId)
    .order("last_seen", { ascending: false });
  if (error) fail("list", error);
  return ((data ?? []) as DeviceRow[]).map(toDevice);
}

/** Unlink one of the person's devices (its token stops working, its jobs go). False when not theirs. */
export async function removeDesktopDevice(userId: string, deviceId: string): Promise<boolean> {
  if (!UUID_RE.test(deviceId)) return false;
  const db = supabaseAdmin();
  const { data, error } = await db.from("desktop_devices").delete().eq("user_id", userId).eq("id", deviceId).select("id");
  if (error) fail("unlink", error);
  if (!((data ?? []) as unknown[]).length) return false;
  await db.from("desktop_jobs").delete().eq("user_id", userId).eq("device_id", deviceId);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Jobs

/** Queue a validated job for the person's most recently seen device. */
export async function enqueueDesktopJob(
  userId: string,
  kind: DesktopKind,
  payload: DesktopPayload,
  now = new Date(),
): Promise<{ jobId: string; deviceName: string } | { error: "no_device" | "too_many" }> {
  const db = supabaseAdmin();
  const [device] = await listDesktopDevices(userId);
  if (!device) return { error: "no_device" };
  const at = now.toISOString();
  const cutoff = new Date(now.getTime() - DESKTOP_JOB_TTL_MS).toISOString();
  // Housekeeping for every user (like old codes in createDesktopCode), so text and file content
  // do not stay behind when a computer never polls again.
  await db.from("desktop_jobs").update({ status: "expired", payload: {}, updated_at: at }).in("status", ["queued", "sent"]).lt("created_at", cutoff);
  await db.from("desktop_jobs").delete().lt("created_at", new Date(now.getTime() - KEEP_JOBS_MS).toISOString());
  const { data: waiting, error: e1 } = await db
    .from("desktop_jobs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "sent"])
    .gte("created_at", cutoff);
  if (e1) fail("enqueue", e1);
  if (((waiting ?? []) as unknown[]).length >= QUEUED_MAX) return { error: "too_many" };
  const jobId = randomUUID();
  const { error } = await db.from("desktop_jobs").insert({
    id: jobId,
    user_id: userId,
    device_id: device.id,
    kind,
    payload,
    status: "queued",
    message: null,
    created_at: at,
    updated_at: at,
  });
  if (error) fail("enqueue", error);
  return { jobId, deviceName: device.name };
}

/** The oldest waiting job of this device, handed out once (status becomes "sent"), or null. */
export async function nextDesktopJob(device: DesktopDevice, now = new Date()): Promise<DesktopJob | null> {
  const db = supabaseAdmin();
  const at = now.toISOString();
  const cutoff = new Date(now.getTime() - DESKTOP_JOB_TTL_MS).toISOString();
  const { error: e1 } = await db
    .from("desktop_jobs")
    .update({ status: "expired", payload: {}, updated_at: at })
    .eq("device_id", device.id)
    .in("status", ["queued", "sent"])
    .lt("created_at", cutoff);
  if (e1) fail("expire", e1);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("desktop_jobs")
      .select("id, kind, payload, created_at")
      .eq("device_id", device.id)
      .eq("user_id", device.userId)
      .eq("status", "queued")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) fail("next", error);
    const row = ((data ?? []) as JobRow[])[0];
    if (!row) return null;
    // Claim it: only one poll wins when two run at once.
    const { data: claimed, error: e2 } = await db
      .from("desktop_jobs")
      .update({ status: "sent", updated_at: at })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id");
    if (e2) fail("next", e2);
    if (((claimed ?? []) as unknown[]).length) {
      const expires = Date.parse(row.created_at) + DESKTOP_JOB_TTL_MS;
      return {
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        createdAt: row.created_at,
        expiresAt: new Date(expires).toISOString(),
        expiresInMs: Math.max(0, Math.min(DESKTOP_JOB_TTL_MS, expires - now.getTime())),
      };
    }
  }
  return null;
}

/** Record what happened to a job this device received. False when it is not this device's or not open. */
export async function finishDesktopJob(
  device: DesktopDevice,
  jobId: string,
  outcome: DesktopOutcome,
  message: string,
  now = new Date(),
): Promise<boolean> {
  if (!UUID_RE.test(jobId)) return false;
  const { data, error } = await supabaseAdmin()
    .from("desktop_jobs")
    .update({ status: outcome, message: cleanText(message).trim().slice(0, 300) || null, payload: {}, updated_at: now.toISOString() })
    .eq("id", jobId)
    .eq("device_id", device.id)
    .eq("user_id", device.userId)
    .eq("status", "sent")
    .select("id");
  if (error) fail("result", error);
  return ((data ?? []) as unknown[]).length > 0;
}
