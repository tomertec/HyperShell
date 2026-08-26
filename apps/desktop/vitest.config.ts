import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [
    {
      name: "sql-text",
      transform(_code: string, id: string) {
        if (id.endsWith(".sql")) {
          const content = readFileSync(id, "utf8");
          return { code: `export default ${JSON.stringify(content)};`, map: null };
        }
      }
    }
  ],
  test: {
    // tests/ is the Playwright Electron suite, but the pure helpers under it
    // (occlusion.ts) carry their own unit tests, which are vitest, not
    // Playwright. The two runners are kept apart by extension:
    // playwright.electron.config.ts matches *.spec.ts only.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"]
  }
});
