import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GhosttyEvent } from "@hypershell/shared";
import { setShell } from "../../lib/shell";
import { createFakeShell } from "../../lib/fakeShell";
import { layoutStore } from "../layout/layoutStore";
import { TERMINAL_FOCUS_REQUEST_EVENT } from "./terminalFocus";
import { useGhosttySurface, type UseGhosttySurfaceInput } from "./useGhosttySurface";

let ghosttyEventListener: ((event: GhosttyEvent) => void) | null = null;
let resizeCallback: ResizeObserverCallback | null = null;
let intersectionCallback: IntersectionObserverCallback | null = null;
let currentRect: { left: number; top: number; width: number; height: number };

class ControllableResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class ControllableIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function setRect(rect: { left: number; top: number; width: number; height: number }): void {
  currentRect = rect;
}

function Harness(props: UseGhosttySurfaceInput) {
  const { containerRef, focused, focusSurface } = useGhosttySurface(props);
  return (
    <div>
      <div ref={containerRef} data-testid="container" />
      <span data-testid="focused">{String(focused)}</span>
      <button data-testid="focus-btn" onClick={focusSurface}>
        focus
      </button>
    </div>
  );
}

describe("useGhosttySurface", () => {
  let ghosttySurfaceCreate: ReturnType<typeof vi.fn>;
  let ghosttySurfaceDestroy: ReturnType<typeof vi.fn>;
  let ghosttySurfaceBounds: ReturnType<typeof vi.fn>;
  let ghosttySurfaceVisible: ReturnType<typeof vi.fn>;
  let ghosttySurfaceFocus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ghosttyEventListener = null;
    resizeCallback = null;
    intersectionCallback = null;
    setRect({ left: 0, top: 0, width: 0, height: 0 });

    vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
    vi.stubGlobal("IntersectionObserver", ControllableIntersectionObserver);
    vi.stubGlobal("devicePixelRatio", 1);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => currentRect as DOMRect
    );

    ghosttySurfaceCreate = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceDestroy = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceBounds = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceVisible = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceFocus = vi.fn().mockResolvedValue(undefined);

    setShell(
      createFakeShell({
        ghosttySurfaceCreate,
        ghosttySurfaceDestroy,
        ghosttySurfaceBounds,
        ghosttySurfaceVisible,
        ghosttySurfaceFocus,
        onGhosttyEvent: vi.fn((listener: (event: GhosttyEvent) => void) => {
          ghosttyEventListener = listener;
          return () => {
            ghosttyEventListener = null;
          };
        })
      }).shell
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setShell(null);
  });

  it("(a) creates the surface once when sessionId becomes non-null and the container has a rect", () => {
    setRect({ left: 10, top: 20, width: 800, height: 600 });

    const { rerender } = render(<Harness sessionId={null} fontSize={13} />);
    expect(ghosttySurfaceCreate).not.toHaveBeenCalled();

    rerender(<Harness sessionId="s1" fontSize={13} />);

    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);
    expect(ghosttySurfaceCreate).toHaveBeenCalledWith({
      sessionId: "s1",
      bounds: { x: 10, y: 20, w: 800, h: 600 },
      fontSize: 13
    });
  });

  it("does not create a surface while the container has no rect yet", () => {
    setRect({ left: 0, top: 0, width: 0, height: 0 });
    render(<Harness sessionId="s1" fontSize={13} />);
    expect(ghosttySurfaceCreate).not.toHaveBeenCalled();
  });

  it("(b) debounces ResizeObserver/scroll-driven bounds updates to one per animation frame", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      setRect({ left: 0, top: 0, width: 800, height: 600 });
      render(<Harness sessionId="s1" fontSize={13} />);
      expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

      setRect({ left: 0, top: 0, width: 900, height: 600 });
      // Fire the observer several times before a frame elapses.
      act(() => {
        resizeCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
        resizeCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
        resizeCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      });
      expect(ghosttySurfaceBounds).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersToNextFrame();
      });

      expect(ghosttySurfaceBounds).toHaveBeenCalledTimes(1);
      expect(ghosttySurfaceBounds).toHaveBeenCalledWith({
        sessionId: "s1",
        bounds: { x: 0, y: 0, w: 900, h: 600 }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("(c) destroys the surface on unmount", () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    const { unmount } = render(<Harness sessionId="s1" fontSize={13} />);
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

    unmount();

    expect(ghosttySurfaceDestroy).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("(d) invokes onGrid for a grid event addressed to this session", () => {
    const onGrid = vi.fn();
    render(<Harness sessionId="s1" fontSize={13} onGrid={onGrid} />);

    act(() => {
      ghosttyEventListener?.({ kind: "grid", sessionId: "s1", cols: 80, rows: 24 });
    });
    expect(onGrid).toHaveBeenCalledWith(80, 24);

    onGrid.mockClear();
    act(() => {
      ghosttyEventListener?.({ kind: "grid", sessionId: "other-session", cols: 1, rows: 1 });
    });
    expect(onGrid).not.toHaveBeenCalled();
  });

  it("(e) invokes onChord for a chord event addressed to this session", () => {
    const onChord = vi.fn();
    render(<Harness sessionId="s1" fontSize={13} onChord={onChord} />);

    act(() => {
      ghosttyEventListener?.({ kind: "chord", sessionId: "s1", chord: "ctrl+shift+d" });
    });

    expect(onChord).toHaveBeenCalledWith("ctrl+shift+d");
  });

  it("(f) flips focused on focusGained/focusLost events for this session", () => {
    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} />);
    expect(getByTestId("focused").textContent).toBe("false");

    act(() => {
      ghosttyEventListener?.({ kind: "focusGained", sessionId: "s1" });
    });
    expect(getByTestId("focused").textContent).toBe("true");

    act(() => {
      ghosttyEventListener?.({ kind: "focusLost", sessionId: "s1" });
    });
    expect(getByTestId("focused").textContent).toBe("false");
  });

  it("(g) calls ghosttySurfaceFocus when a focus request targets this session", () => {
    render(<Harness sessionId="s1" fontSize={13} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TERMINAL_FOCUS_REQUEST_EVENT, { detail: { sessionId: "s1" } })
      );
    });

    expect(ghosttySurfaceFocus).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("(g) ignores a focus request targeting a different session", () => {
    render(<Harness sessionId="s1" fontSize={13} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TERMINAL_FOCUS_REQUEST_EVENT, { detail: { sessionId: "other" } })
      );
    });

    expect(ghosttySurfaceFocus).not.toHaveBeenCalled();
  });

  it("(h) reports IntersectionObserver changes via ghosttySurfaceVisible", () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    render(<Harness sessionId="s1" fontSize={13} />);

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(ghosttySurfaceVisible).toHaveBeenCalledWith({ sessionId: "s1", visible: false });

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });
    expect(ghosttySurfaceVisible).toHaveBeenCalledWith({ sessionId: "s1", visible: true });
  });

  it("title flow: a title event writes the sanitized title to layoutStore", () => {
    const setTabDynamicTitle = vi.spyOn(layoutStore.getState(), "setTabDynamicTitle");
    render(<Harness sessionId="s1" fontSize={13} />);

    act(() => {
      ghosttyEventListener?.({ kind: "title", sessionId: "s1", title: "  hello   world  " });
    });

    expect(setTabDynamicTitle).toHaveBeenCalledWith("s1", "hello world");
  });

  it("focusSurface() calls ghosttySurfaceFocus for the current session", () => {
    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} />);

    act(() => {
      getByTestId("focus-btn").click();
    });

    expect(ghosttySurfaceFocus).toHaveBeenCalledWith({ sessionId: "s1" });
  });
});
