import { defineConfig } from "@playwright/test";

// The Electron suite is deliberately separate from apps/ui's browser suite.
// The browser suite is the fast feedback loop; this one boots the real shell —
// preload bridge, Zod-validated IPC, native modules, SQLite on disk, windows —
// which Chromium against the Vite dev server cannot exercise at all.
export default defineConfig({
  testDir: "./tests",
  // App launch plus a bundled-renderer first paint is a few seconds on cold CI.
  timeout: 120_000,
  expect: {
    timeout: 15_000
  },
  // Each test launches its own Electron process against its own data dir.
  // Serial execution keeps launches from contending for CPU on CI runners and
  // keeps failures readable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]]
});
