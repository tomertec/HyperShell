import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

// The Electron suite is deliberately separate from apps/ui's browser suite.
// The browser suite is the fast feedback loop; this one boots the real shell —
// preload bridge, Zod-validated IPC, native modules, SQLite on disk, windows —
// which Chromium against the Vite dev server cannot exercise at all.

// The ghostty specs need the real ghostty-host.exe, which is built out of the
// Zig host repo and is not checked in here. It reaches the app through
// GHOSTTY_HOST_PATH (src/main/ghosttyHost/hostPath.ts), which electronHarness
// forwards along with the rest of process.env when it launches Electron.
// Resolving it here — absolute, existence-checked — is what makes a typo fail
// once, loudly, at config load, instead of surfacing inside every ghostty spec
// as the same opaque "ghostty is unavailable" every handler throws. Left
// unset, the ghostty specs skip; the rest of the suite is unaffected either
// way.
const ghosttyHostPath = process.env.GHOSTTY_HOST_PATH;
if (ghosttyHostPath) {
  const resolved = path.resolve(ghosttyHostPath);
  if (!existsSync(resolved)) {
    throw new Error(`GHOSTTY_HOST_PATH points at a file that does not exist: ${resolved}`);
  }
  process.env.GHOSTTY_HOST_PATH = resolved;
}

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
