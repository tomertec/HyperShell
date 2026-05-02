import path from "node:path";
import { fileURLToPath } from "node:url";

export interface RendererUrlPolicy {
  packagedRendererPath?: string;
  allowDevServer?: boolean;
  devOrigins?: readonly string[];
}

const DEFAULT_DEV_ORIGINS = ["http://127.0.0.1:5173"] as const;

function sameFilePath(left: URL, rightPath: string): boolean {
  return path.resolve(fileURLToPath(left)) === path.resolve(rightPath);
}

export function assertAllowedRendererUrl(rawUrl: string, policy: RendererUrlPolicy): URL {
  const parsed = new URL(rawUrl);

  if (parsed.protocol === "file:") {
    if (policy.packagedRendererPath && sameFilePath(parsed, policy.packagedRendererPath)) {
      return parsed;
    }
    throw new Error(`Renderer URL is not allowed: ${rawUrl}`);
  }

  const devOrigins = policy.devOrigins ?? DEFAULT_DEV_ORIGINS;
  const isAllowedDevServer = policy.allowDevServer === true
    && parsed.protocol === "http:"
    && devOrigins.includes(parsed.origin);

  if (isAllowedDevServer) {
    return parsed;
  }

  throw new Error(`Renderer URL is not allowed: ${rawUrl}`);
}

export function isAllowedNavigationTarget(rendererUrl: string, targetUrl: string): boolean {
  const renderer = new URL(rendererUrl);
  const target = new URL(targetUrl);

  if (renderer.protocol === "file:") {
    return target.protocol === "file:" && sameFilePath(target, fileURLToPath(renderer));
  }

  return target.origin === renderer.origin;
}

export function attachWindowSecurityGuards(
  win: Pick<Electron.BrowserWindow, "webContents">,
  rendererUrl: string
): void {
  const allowedRendererUrl = new URL(rendererUrl).toString();

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationTarget(allowedRendererUrl, url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
