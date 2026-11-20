import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

beforeEach(() => {
  vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secret encryption", () => {
  it("round-trips a token", () => {
    const token = "1//0refresh-token-example_ÄÖÜ-монгол";
    const blob = encryptSecret(token);
    expect(blob.startsWith("v1.")).toBe(true);
    expect(blob.split(".")).toHaveLength(3);
    expect(blob).not.toContain(token);
    expect(decryptSecret(blob)).toBe(token);
  });

  it("two encryptions differ (random IV)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("tampered blob throws", () => {
    const blob = encryptSecret("secret value");
    const [v, iv, ct] = blob.split(".");
    const bytes = Buffer.from(ct, "base64url");
    bytes[0] ^= 0x01;
    expect(() => decryptSecret(`${v}.${iv}.${bytes.toString("base64url")}`)).toThrow();
    expect(() => decryptSecret("v2.abc.def")).toThrow();
    expect(() => decryptSecret("garbage")).toThrow();
  });

  it("wrong key length throws", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => encryptSecret("x")).toThrow("DATA_ENCRYPTION_KEY must be 32 bytes");
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    expect(() => encryptSecret("x")).toThrow("DATA_ENCRYPTION_KEY must be 32 bytes");
  });

  it("a blob from another key does not decrypt", () => {
    const blob = encryptSecret("secret");
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptSecret(blob)).toThrow();
  });
});
