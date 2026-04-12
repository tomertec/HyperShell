import { describe, expect, it, vi } from "vitest";

import {
  assertAllowedRendererUrl,
  attachWindowSecurityGuards,
  isAllowedNavigationTarget,
} from "./windowSecurity";

describe("assertAllowedRendererUrl", () => {
  it("accepts local dev and file renderer URLs", () => {
    expect(assertAllowedRendererUrl("http://localhost:5173").toString()).toBe("http://localhost:5173/");
    expect(assertAllowedRendererUrl("http://127.0.0.1:5173").toString()).toBe("http://127.0.0.1:5173/");
    expect(assertAllowedRendererUrl("file:///tmp/renderer/index.html").toString()).toBe("file:///tmp/renderer/index.html");
  });

  it("rejects remote renderer URLs", () => {
    expect(() => assertAllowedRendererUrl("https://evil.example/app")).toThrow(/renderer url/i);
  });
});

describe("isAllowedNavigationTarget", () => {
  it("allows same-origin dev navigation and same-file production navigation", () => {
    expect(isAllowedNavigationTarget("http://localhost:5173", "http://localhost:5173/?window=editor")).toBe(true);
    expect(isAllowedNavigationTarget("file:///tmp/renderer/index.html", "file:///tmp/renderer/index.html?window=editor")).toBe(true);
  });

  it("rejects cross-origin and cross-file navigation", () => {
    expect(isAllowedNavigationTarget("http://localhost:5173", "https://evil.example/")).toBe(false);
    expect(isAllowedNavigationTarget("file:///tmp/renderer/index.html", "file:///tmp/renderer/other.html")).toBe(false);
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

    attachWindowSecurityGuards(fakeWindow as never, "http://localhost:5173");

    const preventDefault = vi.fn();
    willNavigateHandlers[0]?.({ preventDefault }, "https://evil.example/");
    expect(preventDefault).toHaveBeenCalledTimes(1);

    const handler = setWindowOpenHandler.mock.calls[0]?.[0] as ((details: { url: string }) => { action: string });
    expect(handler({ url: "http://localhost:5173/help" })).toEqual({ action: "deny" });
  });
});
