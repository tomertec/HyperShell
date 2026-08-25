import path from "node:path";

/**
 * Locates the ghostty-host.exe binary. Dev builds point `GHOSTTY_HOST_PATH`
 * at the built exe directly; packaged builds carry it under
 * `process.resourcesPath/ghostty-host/ghostty-host.exe` (see
 * electron-builder.yml's `extraResources`, populated from `GHOSTTY_HOST_DIST`
 * at package time).
 */
export function resolveGhosttyHostPath(): string {
  const envPath = process.env.GHOSTTY_HOST_PATH;
  if (envPath) return envPath;

  const resourcesPath = process.resourcesPath;
  if (!resourcesPath) {
    // process.resourcesPath only exists inside a packaged/running Electron
    // process. Silently joining it while undefined would produce the
    // literal path "undefined/ghostty-host/ghostty-host.exe" instead of
    // failing where the mistake was made, so this fails loudly instead.
    throw new Error(
      "Cannot resolve ghostty-host.exe: GHOSTTY_HOST_PATH is not set and " +
        "process.resourcesPath is unavailable (not running inside a packaged " +
        "Electron app). Set GHOSTTY_HOST_PATH to the built exe for dev/test runs."
    );
  }

  return path.join(resourcesPath, "ghostty-host", "ghostty-host.exe");
}
