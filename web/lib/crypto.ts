// Encryption for secrets stored in the cloud (Google refresh tokens, Slack bot tokens).
// AES-256-GCM, key = base64 DATA_ENCRYPTION_KEY (32 bytes). Server only.
// Format: v1.<iv base64url>.<ciphertext+tag base64url>
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const k = Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes");
  return k;
}

export function encryptSecret(plain: string): string {
  const k = key();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${iv.toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptSecret(blob: string): string {
  const k = key();
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error("Unsupported secret format");
  const iv = Buffer.from(parts[1], "base64url");
  const data = Buffer.from(parts[2], "base64url");
  if (iv.length !== IV_BYTES || data.length < TAG_BYTES) throw new Error("Malformed secret");
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]).toString("utf8");
}
