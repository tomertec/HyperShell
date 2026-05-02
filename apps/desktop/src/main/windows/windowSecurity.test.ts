import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertAllowedRendererUrl,
  attachWindowSecurityGuards,
  isAllowedNavigationTarget,
} from "./windowSecurity";

const rendererPath = path.resolve("tmp", "renderer", "index.html");
const rendererUrl = pathToFileURL(rendererPath).toString();

describe("assertAllowedRendererUrl", () => {
  it("accepts the exact dev origin and packaged renderer file", () => {
    const policy = { packagedRendererPath: rendererPath, allowDevServer: true };

    expect(assertAllowedRendererUrl("http://127.0.0.1:5173", policy).toString()).toBe("http://127.0.0.1:5173/");
    expect(assertAllowedRendererUrl(rendererUrl, policy).toString()).toBe(rendererUrl);
  });

  it("rejects remote, broad local, and unexpected file renderer URLs", () => {
    const policy = { packagedRendererPath: rendererPath, allowDevServer: true };

    expect(() => assertAllowedRendererUrl("https://evil.example/app", policy)).toThrow(/renderer url/i);
    expect(() => assertAllowedRendererUrl("http://localhost:5173", policy)).toThrow(/renderer url/i);
    expect(() => assertAllowedRendererUrl(pathToFileURL(path.resolve("tmp", "other.html")).toString(), policy)).toThrow(/renderer url/i);
  });
});

describe("isAllowedNavigationTarget", () => {
  it("allows same-origin dev navigation and same-file production navigation", () => {
    expect(isAllowedNavigationTarget("http://127.0.0.1:5173", "http://127.0.0.1:5173/?window=editor")).toBe(true);
    expect(isAllowedNavigationTarget(rendererUrl, `${rendererUrl}?window=editor`)).toBe(true);
  });

  it("rejects cross-origin and cross-file navigation", () => {
    expect(isAllowedNavigationTarget("http://127.0.0.1:5173", "https://evil.example/")).toBe(false);
    expect(isAllowedNavigationTarget(rendererUrl, pathToFileURL(path.resolve("tmp", "renderer", "other.html")).toString())).toBe(false);
  });
});

describe("attachWindowSecurityGuards", () => {
  it("blocks unexpected navigation and denies new windows", () => {
    const willNavigateHandlers: Array<(event: { preventDefault: () => void }, url: string) => void> = [];
    const setWindowOpenHandler = vi.fn();

    const fakeWindow = {
      webContents: {
        on: vi.fn((event: string, handler: (event: { preventDefault: () => void }, url: string) => void) => {
          if (event === "will-navigate") {
            willNavigateHandlers.push(handler);
          }
        }),
        setWindowOpenHandler,
      },
    } as const;

    attachWindowSecurityGuards(fakeWindow as never, "http://127.0.0.1:5173");

    const preventDefault = vi.fn();
    willNavigateHandlers[0]?.({ preventDefault }, "https://evil.example/");
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as ((details: { url: string }) => { action: string });
    expect(handler({ url: "http://127.0.0.1:5173/help" })).toEqual({ action: "deny" });
  });
});
