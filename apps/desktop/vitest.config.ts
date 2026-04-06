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
    include: ["src/**/*.test.ts"]
  }
});
