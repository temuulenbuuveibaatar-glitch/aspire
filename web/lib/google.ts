// Gmail (read-only). Access tokens come from Clerk (lib/google-token.ts); nothing here is stored.

/** One recent message: display name only (no address), subject, ISO date and Gmail's short preview. */
export interface MailItem {
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

/** Google said the token is no good: expired, revoked, or missing the Gmail scope. */
export class GoogleAuthError extends Error {
  constructor(
    readonly status: number,
    /** True when the token works but Gmail was never granted (403 insufficient scope). */
    readonly missingScope = false,
  ) {
    super(missingScope ? "Gmail access was not granted" : `Google rejected the token (${status})`);
    this.name = "GoogleAuthError";
  }
}

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
export const MAX_MAIL = 10;

async function gmail<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    redirect: "error",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    // Read only the reason code; never echo the body (or the token) into logs or errors.
    const body = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] } } | null;
    const reasons = [...(body?.error?.errors ?? []), ...(body?.error?.details ?? [])].map((e) => e?.reason ?? "");
    const missingScope = res.status === 403 && reasons.some((r) => /insufficientPermissions|SCOPE_INSUFFICIENT/i.test(r));
    throw new GoogleAuthError(res.status, missingScope);
  }
  if (!res.ok) throw new Error(`Gmail returned ${res.status}`);
  return (await res.json()) as T;
}

/** `"NVIDIA" <news@nvidia.com>` -> `NVIDIA`; a bare address -> its domain (`nvidia.com`). */
export function senderName(raw: string): string {
  const v = raw.trim();
  const named = v.match(/^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/);
  if (named && named[1].trim()) return named[1].trim().slice(0, 80);
  const addr = v.replace(/[<>]/g, "").trim();
  const at = addr.lastIndexOf("@");
  if (at >= 0) return addr.slice(at + 1).slice(0, 80) || "unknown";
  return addr.slice(0, 80) || "unknown";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

interface GmailMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

/**
 * Recent messages matching a Gmail search (`q`), newest first, at most 10. Metadata only:
 * From, Subject and Date headers plus Gmail's snippet. Throws GoogleAuthError on 401/403.
 */
export async function listRecentMail(accessToken: string, opts: { query: string; max: number }): Promise<MailItem[]> {
  const max = Math.min(MAX_MAIL, Math.max(1, Math.floor(Number(opts.max) || MAX_MAIL)));
  const list = await gmail<{ messages?: { id: string }[] }>(
    `${API}?maxResults=${max}&q=${encodeURIComponent(opts.query.slice(0, 300))}`,
    accessToken,
  );
  const ids = (list.messages ?? []).slice(0, max).map((m) => m.id);
  const meta = "format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date";
  const messages = await Promise.all(ids.map((id) => gmail<GmailMessage>(`${API}/${encodeURIComponent(id)}?${meta}`, accessToken)));
  return messages.map((m) => {
    const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    const internal = Number(m.internalDate);
    const parsed = new Date(header("Date"));
    const date = Number.isFinite(internal) && internal > 0 ? new Date(internal) : parsed;
    return {
      from: senderName(header("From")),
      subject: header("Subject").trim().slice(0, 200),
      date: Number.isNaN(date.getTime()) ? "" : date.toISOString(),
      snippet: decodeEntities(m.snippet ?? "").trim().slice(0, 200),
    };
  });
}
