import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    // Workspace default. A test needing real Node semantics (e.g. Buffer
    // byte-length edge cases) can opt out per-file with a leading
    // `// @vitest-environment node` pragma.
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx"
    ],
    exclude: ["tests/**"],
    setupFiles: ["./vitest.setup.ts"]
  }
});
