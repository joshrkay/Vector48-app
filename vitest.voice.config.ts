import { defineConfig } from "vitest/config";
import path from "path";

/** Voice router tests — no MSW / global mocks (avoids setup hang with isolated unit tests). */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15_000,
    include: ["tests/voice/**/*.test.ts"],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
