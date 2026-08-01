import { app } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Redirects every on-disk location the app derives from Electron's `appData` /
 * `userData` roots — the SQLite host database, auto-backups, recordings, SFTP
 * scratch files — into one directory named by `HYPERSHELL_DATA_DIR`.
 *
 * This exists for the Electron E2E suite. The host database lives at
 * `appData/HyperShell/hypershell.db` (see `resolveDatabasePath` in
 * `ipc/hostsIpc.ts`), which Electron's `--user-data-dir` switch does NOT move,
 * so without this seam an E2E run would open and mutate the developer's real
 * hosts. Unset in normal runs, where every path resolves exactly as before.
 *
 * Import this module for its side effect *first* in `main.ts`: the override has
 * to land before any module that reads an app path is evaluated, and before
 * `app.whenReady()`.
 */
const overrideDir = process.env.HYPERSHELL_DATA_DIR;

if (overrideDir) {
  const resolvedDir = path.resolve(overrideDir);
  const userDataDir = path.join(resolvedDir, "HyperShell");

  mkdirSync(userDataDir, { recursive: true });

  app.setPath("appData", resolvedDir);
  app.setPath("userData", userDataDir);

  console.log("[hypershell] HYPERSHELL_DATA_DIR override active:", resolvedDir);
}

export {};
