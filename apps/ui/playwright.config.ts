import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const startServer = process.env.PLAYWRIGHT_START_SERVER !== "0";
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions: chromiumExecutablePath
      ? {
          executablePath: chromiumExecutablePath
        }
      : undefined
  },
  webServer: startServer
    ? {
        command: "pnpm exec vite --host 127.0.0.1 --port 5173",
        cwd: ".",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
    : undefined
});
