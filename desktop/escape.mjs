// Pure helpers for Aspire Desktop: checking jobs again on this computer (never trust the
// server blindly), escaping text for the keyboard tools, keeping files inside ~/Aspire and
// showing job text in the terminal without control characters. No side effects.
import path from "node:path";

export const TEXT_MAX = 2000;
export const FILE_MAX_BYTES = 200 * 1024;
export const JOB_TTL_MS = 5 * 60_000;
export const PREVIEW_CHARS = 1200;
export const KINDS = ["open_app", "open_url", "type_text", "save_file", "fill_form"];

// Control characters (tab and newline kept), DEL, C1 controls, bidi marks and overrides,
// zero-width characters, line/paragraph separators and BOM. Same set in web/lib/desktop.ts.
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const SHOWN = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** Normalised newlines, no control, bidi or invisible characters. */
export const cleanText = (s) => String(s).replace(/\r\n?/g, "\n").replace(UNSAFE, "");

/** Text for the terminal: every control, bidi or invisible character (except newline) shown as \u{..}. */
export function displaySafe(s) {
  return String(s).replace(SHOWN, (c) => (c === "\t" ? "\\t" : `\\u{${c.codePointAt(0).toString(16)}}`));
}

/**
 * Text for Windows SendKeys: + ^ % ~ ( ) { } [ ] are wrapped in braces so they are typed, not
 * read as Shift, Ctrl, Alt, Enter or key groups. Newline becomes {ENTER}, tab {TAB}.
 */
export function escapeSendKeys(text) {
  return cleanText(text)
    .replace(/[+^%~(){}[\]]/g, "{$&}")
    .replace(/\n/g, "{ENTER}")
    .replace(/\t/g, "{TAB}");
}

/** SendKeys string for a form: each value typed, {TAB} between them. */
export const formSendKeys = (values) => values.map(escapeSendKeys).join("{TAB}");

/** Pairing codes: 10 characters without look-alikes (no I, L, O, 0, 1), as in web/lib/desktop.ts. */
export const PAIR_CODE_RE = /^[A-HJKMNP-Z2-9]{10}$/;
/** A typed code in canonical form: upper case, no spaces or dashes. */
export const normalizePairCode = (s) => String(s).slice(0, 64).toUpperCase().replace(/[\s-]+/g, "");

const APP_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._+&'-]{0,79}$/u;
const FILE_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,99}$/u;
const RESERVED_FILE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\s*\..*)?$/i;
/** Plain text types only: no shortcuts (.url .scf .lnk), scripts or programs. */
const TEXT_EXT = /\.(txt|md|csv|tsv|json|log|ics|vcf)$/i;

/** An app name (never a path or an option: starts with a letter or digit). */
export const isAppName = (s) => typeof s === "string" && APP_RE.test(s);

/** A plain text file name: no folders, no "..", no Windows device names, a text extension. */
export function isSafeFileName(name) {
  return typeof name === "string" && FILE_RE.test(name) && TEXT_EXT.test(name) && !name.includes("..") && !RESERVED_FILE.test(name);
}

/** The full path of `name` directly inside `baseDir`, or null when it would land anywhere else. */
export function confinedPath(baseDir, name) {
  if (!isSafeFileName(name)) return null;
  const base = path.resolve(baseDir);
  const full = path.resolve(base, name);
  return path.dirname(full) === base && path.basename(full) === name ? full : null;
}

/** "notes.txt" -> "notes (2).txt" for n = 2. */
export function numberedName(name, n) {
  const ext = path.extname(name);
  return `${name.slice(0, name.length - ext.length)} (${n})${ext}`;
}

/** An https URL without credentials, normalised, or null. */
export function httpsUrl(raw) {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** The server address to talk to: https, or http only for this computer (development). */
export function serverUrl(raw) {
  try {
    const u = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (u.username || u.password || !(u.protocol === "https:" || (u.protocol === "http:" && local))) return null;
    return u.origin;
  } catch {
    return null;
  }
}

const norm = (s) => s.toLowerCase().replace(/\.(lnk|desktop|app|exe)$/i, "").replace(/[\s._-]+/g, " ").trim();
// Shortcuts that remove or change an install: never picked unless the name asked for them.
const RISKY = /\b(uninstall|uninstaller|remove|setup|repair)\b/;

/**
 * The best match for an app name among `candidates` ({ name, target }): same name first, then a
 * name that starts with it, then one that contains it as a word. Null when nothing fits.
 */
export function matchApp(want, candidates) {
  const w = norm(want);
  if (!w) return null;
  const named = candidates.map((c) => ({ c, n: norm(c.name) })).filter((x) => !RISKY.test(x.n) || RISKY.test(w));
  const hit =
    named.find((x) => x.n === w) ??
    named.find((x) => x.n.startsWith(`${w} `)) ??
    named.find((x) => ` ${x.n} `.includes(` ${w} `));
  return hit ? hit.c : null;
}

/** Windows apps that are always there (or registered in App Paths), by common name. */
export const WINDOWS_APPS = new Map(Object.entries({
  notepad: "notepad.exe",
  calculator: "calc.exe",
  calc: "calc.exe",
  paint: "mspaint.exe",
  "file explorer": "explorer.exe",
  explorer: "explorer.exe",
  edge: "msedge.exe",
  "microsoft edge": "msedge.exe",
  chrome: "chrome.exe",
  "google chrome": "chrome.exe",
  firefox: "firefox.exe",
  word: "winword.exe",
  excel: "excel.exe",
  powerpoint: "powerpnt.exe",
  outlook: "outlook.exe",
  "snipping tool": "snippingtool.exe",
}));

/**
 * Checks a job from the server again. Returns { ok: true, job } with a clean payload, or
 * { ok: false, reason }. job.expiresAt is on this computer's clock: the time left that the
 * server sent (expiresInMs, at most 5 minutes) added to `now`, so a wrong clock here does not
 * matter. Without expiresInMs the server's absolute expiresAt is used.
 */
export function checkJob(job, now = Date.now()) {
  const bad = (reason) => ({ ok: false, reason });
  if (!job || typeof job !== "object" || typeof job.id !== "string" || !KINDS.includes(job.kind)) return bad("unknown job");
  const p = job.payload && typeof job.payload === "object" ? job.payload : {};
  const left = typeof job.expiresInMs === "number" ? job.expiresInMs : Date.parse(job.expiresAt) - now;
  if (!Number.isFinite(left)) return bad("no expiry");
  const expiresAt = now + Math.max(0, Math.min(JOB_TTL_MS, left));
  const ok = (payload) => ({ ok: true, job: { id: job.id, kind: job.kind, payload, expiresAt } });
  switch (job.kind) {
    case "open_app":
      return isAppName(p.app) ? ok({ app: p.app }) : bad("not an app name");
    case "open_url": {
      const url = httpsUrl(p.url);
      return url ? ok({ url }) : bad("not an https address");
    }
    case "type_text": {
      const text = typeof p.text === "string" ? cleanText(p.text) : "";
      return text && text.length <= TEXT_MAX ? ok({ text }) : bad("text missing or too long");
    }
    case "save_file":
      if (!isSafeFileName(p.name)) return bad("not a plain text file name");
      if (typeof p.content !== "string" || Buffer.byteLength(p.content, "utf8") > FILE_MAX_BYTES) return bad("content missing or too large");
      return ok({ name: p.name, content: p.content });
    case "fill_form": {
      const fields = Array.isArray(p.fields) ? p.fields : [];
      if (!fields.length || fields.length > 20) return bad("wrong number of fields");
      const clean = fields.map((f) => ({
        label: cleanText(f?.label ?? "").slice(0, 100),
        value: cleanText(f?.value ?? "").replace(/[\t\n]+/g, " "),
      }));
      if (clean.some((f) => f.value.length > 500) || clean.reduce((n, f) => n + f.value.length, 0) > TEXT_MAX) return bad("values too long");
      return ok({ fields: clean });
    }
  }
  return bad("unknown job");
}

/**
 * Text as numbered lines ("  3| ..."), so line breaks cannot push what comes first out of
 * sight unnoticed: three or more blank lines in a row become one "[N blank lines]" line.
 */
export function numberedLines(text) {
  const lines = text.split("\n");
  const pad = (n) => String(n).padStart(3);
  const out = [];
  for (let i = 0; i < lines.length; ) {
    if (lines[i].trim() === "") {
      let j = i;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j - i > 2) out.push(`${pad(i + 1)}| [${j - i} blank lines]`);
      else for (let k = i; k < j; k++) out.push(`${pad(k + 1)}|`);
      i = j;
    } else {
      out.push(`${pad(i + 1)}| ${displaySafe(lines[i])}`);
      i++;
    }
  }
  return out;
}

const lineCount = (s) => s.split("\n").length;

/**
 * Exactly what a checked job will do, as lines for the terminal. The last line of a text job is
 * a summary, so it sits right above the Allow prompt. `appTargets` are what open_app starts.
 */
export function describeJob(job, aspireDir, appTargets = []) {
  const p = job.payload;
  switch (job.kind) {
    case "open_app":
      return [
        `Open the app: ${displaySafe(p.app)}`,
        ...appTargets.map((t, i) => `  ${i ? "if that fails, starts" : "starts"}: ${displaySafe(t)}`),
      ];
    case "open_url":
      return [`Open in your browser: ${displaySafe(p.url)}`];
    case "type_text": {
      const lines = lineCount(p.text);
      return [
        "Type this text into the window you click:",
        "-----",
        ...numberedLines(p.text),
        "-----",
        `Summary: types ${p.text.length} characters on ${lines} lines and presses Enter ${lines - 1} times.`,
      ];
    }
    case "save_file": {
      const cut = p.content.length > PREVIEW_CHARS;
      return [
        `Save a text file: ${displaySafe(path.join(aspireDir, p.name))}`,
        "-----",
        ...numberedLines(cut ? p.content.slice(0, PREVIEW_CHARS) : p.content),
        ...(cut ? [`[... ${p.content.length - PREVIEW_CHARS} more characters not shown]`] : []),
        "-----",
        `Summary: saves ${Buffer.byteLength(p.content, "utf8")} bytes on ${lineCount(p.content)} lines${cut ? `; only the first ${PREVIEW_CHARS} characters are shown` : ""}.`,
      ];
    }
    case "fill_form":
      return [
        "Fill a form in the window you click: type each value, press Tab between them:",
        ...p.fields.map((f, i) => `  ${i + 1}. ${displaySafe(f.label)}: ${displaySafe(f.value)}`),
        `Summary: types ${p.fields.length} values, presses Tab ${p.fields.length - 1} times and never Enter.`,
      ];
  }
  return [];
}

/** An error whose message is safe to send to the server (no local paths or user name). */
export const publicError = (message) => Object.assign(new Error(message), { public: true });

/** What a failure tells the server: a public message, or only an error code. */
export function safeReason(e) {
  if (e && e.public === true && typeof e.message === "string") return e.message;
  if (e && typeof e.code === "string" && /^[A-Z0-9_]{1,40}$/.test(e.code)) return `Failed (${e.code}).`;
  if (e && Number.isInteger(e.code)) return `Failed (exit ${e.code}).`;
  return "Failed.";
}
