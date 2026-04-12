export function assertAllowedRendererUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);

  if (parsed.protocol === "file:") {
    return parsed;
  }

  const isLocalHttp = (parsed.protocol === "http:" || parsed.protocol === "https:")
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

  if (isLocalHttp) {
    return parsed;
  }

  throw new Error(`Renderer URL is not allowed: ${rawUrl}`);
}

export function isAllowedNavigationTarget(rendererUrl: string, targetUrl: string): boolean {
  const renderer = assertAllowedRendererUrl(rendererUrl);
  const target = new URL(targetUrl);

  if (renderer.protocol === "file:") {
    return target.protocol === "file:" && target.pathname === renderer.pathname;
  }

  return target.origin === renderer.origin;
}

export function attachWindowSecurityGuards(
  win: Pick<Electron.BrowserWindow, "webContents">,
  rendererUrl: string
): void {
  const allowedRendererUrl = assertAllowedRendererUrl(rendererUrl).toString();

  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigationTarget(allowedRendererUrl, url)) {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
