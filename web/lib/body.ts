/**
 * The request body as text, or null when it is empty or over `maxBytes`. Never buffers more than
 * `maxBytes`: a too-large Content-Length is refused before reading, and the stream is cut off as
 * soon as it passes the cap (a client can omit or lie about Content-Length). Server only.
 */
export async function readText(req: Request, maxBytes: number): Promise<string | null> {
  const len = req.headers.get("content-length");
  if (len !== null && !(Number(len) <= maxBytes)) return null;
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  if (size === 0) return null;
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Largest webhook body the bot routes accept (Slack, Discord and Telegram send a few KB). */
export const WEBHOOK_MAX_BYTES = 65_536;
