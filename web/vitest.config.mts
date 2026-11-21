import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
    },
  },
  // Route tests give each request its own x-real-ip, as Vercel would.
  test: { include: ["tests/**/*.test.ts"], env: { TRUST_PROXY: "1" } },
});
