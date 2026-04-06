import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/*", "packages/*"],
    include: [
      "apps/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx"
    ],
    exclude: [
      ...configDefaults.exclude,
      "apps/ui/tests/**"
    ]
  }
});
