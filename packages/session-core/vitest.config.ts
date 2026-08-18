import { defineConfig } from "vitest/config";

// Without a config here, `pnpm --filter @hypershell/session-core test` resolves
// the root config, whose `projects: ["apps/*", "packages/*"]` globs match
// nothing from inside the package — vitest then reports "No projects were
// found" and the tests never run.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"]
  }
});
