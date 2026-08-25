import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library only auto-registers its cleanup when a global
// `afterEach` exists (i.e. `test.globals: true`). This project does not enable
// globals, so without this file every `.test.tsx` with more than one test case
// leaks the previous test's DOM into the next one.
afterEach(() => {
  cleanup();
});

// jsdom implements neither observer. This is a safe do-nothing default so any
// component that merely constructs one (TabBar.tsx, useGhosttySurface.ts)
// doesn't crash tests that don't care about its behavior; a test that does
// care installs its own controllable mock via `vi.stubGlobal` (see
// useGhosttySurface.test.tsx), which — being per-test-file — takes precedence
// without needing to touch this shared default.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    constructor(_callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    root = null;
    rootMargin = "";
    thresholds: ReadonlyArray<number> = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}
