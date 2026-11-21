// Discord interactions: request signature check and replies to deferred commands.
import { splitText } from "./split";

export const DISCORD_API = "https://discord.com/api/v10";
export const DISCORD_MAX_TEXT = 2000;
export const EPHEMERAL = 64;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Ed25519 check of `timestamp + rawBody` against the app's public key (WebCrypto). */
export async function verifyDiscord(signatureHex: string, timestamp: string, rawBody: string, publicKeyHex: string): Promise<boolean> {
  const sig = hexToBytes(signatureHex);
  const pub = hexToBytes(publicKeyHex);
  if (!sig || sig.length !== 64 || !pub || pub.length !== 32 || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, sig, new TextEncoder().encode(timestamp + rawBody));
  } catch {
    return false;
  }
}

async function discordFetch(url: string, method: "PATCH" | "POST", body: object): Promise<void> {
  const res = await fetch(url, {
    redirect: "error",
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error(`Discord ${method}: network error`);
  });
  // The interaction token is in the URL: never include the URL in errors.
  if (!res.ok) throw new Error(`Discord ${method} failed (${res.status})`);
}

/**
 * Answer a deferred interaction: edit the "thinking…" message, then post any
 * remaining text (over 2000 characters) as follow-up messages.
 */
export async function discordReply(appId: string, interactionToken: string, text: string, flags?: number): Promise<void> {
  const base = `${DISCORD_API}/webhooks/${encodeURIComponent(appId)}/${encodeURIComponent(interactionToken)}`;
  const [first, ...rest] = splitText(text, DISCORD_MAX_TEXT);
  const common = { allowed_mentions: { parse: [] as string[] }, ...(flags ? { flags } : {}) };
  await discordFetch(`${base}/messages/@original`, "PATCH", { content: first ?? "…", ...common });
  for (const chunk of rest) await discordFetch(base, "POST", { content: chunk, ...common });
}
