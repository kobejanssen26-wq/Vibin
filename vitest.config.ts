import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * Unit tests for pure logic (the match engine, validators, date helpers) run in
 * a plain Node environment — fast and dependency-free.
 *
 * Integration tests that need D1/KV bindings live under `src/worker/**\/*.itest.ts`
 * and run against `@cloudflare/vitest-pool-workers` (see vitest.integration.config.ts).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.itest.ts", "node_modules/**"],
  },
});
