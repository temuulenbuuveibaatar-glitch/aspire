// Small helpers shared by the bot webhooks.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Constant-time string comparison (hashes first, so lengths do not leak either). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** HMAC-SHA256 as base64url. */
export function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Remembers the last `size` ids; `firstTime(id)` is true only the first time an id is seen. */
export function recentIds<T>(size: number) {
  const seen = new Set<T>();
  const order: T[] = [];
  return {
    firstTime(id: T): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      order.push(id);
      if (order.length > size) seen.delete(order.shift() as T);
      return true;
    },
  };
}
