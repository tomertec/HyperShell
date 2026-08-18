import { defineConfig } from "vitest/config";

// See packages/session-core/vitest.config.ts — without this, running the
// package's own `test` script resolves the root config and finds no projects.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"]
  }
});
