import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GhosttyEvent } from "@hypershell/shared";
import { setShell } from "../../lib/shell";
import { createFakeShell } from "../../lib/fakeShell";
import { layoutStore } from "../layout/layoutStore";
import { TERMINAL_FOCUS_REQUEST_EVENT } from "./terminalFocus";
import { useGhosttySurface, type UseGhosttySurfaceInput } from "./useGhosttySurface";

let ghosttyEventListener: ((event: GhosttyEvent) => void) | null = null;
let resizeCallback: ResizeObserverCallback | null = null;
let currentRect: { left: number; top: number; width: number; height: number };

class ControllableResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function setRect(rect: { left: number; top: number; width: number; height: number }): void {
  currentRect = rect;
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Harness(props: UseGhosttySurfaceInput) {
  const { containerRef, focused, focusSurface, surfaceError, retrySurface } =
    useGhosttySurface(props);
  return (
    <div>
      <div ref={containerRef} data-testid="container" />
      <span data-testid="focused">{String(focused)}</span>
      <span data-testid="surface-error">{String(surfaceError)}</span>
      <button data-testid="focus-btn" onClick={focusSurface}>
        focus
      </button>
      <button data-testid="retry-btn" onClick={retrySurface}>
        retry
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
  let ghosttySurfaceConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ghosttyEventListener = null;
    resizeCallback = null;
    setRect({ left: 0, top: 0, width: 0, height: 0 });

    vi.stubGlobal("ResizeObserver", ControllableResizeObserver);
    vi.stubGlobal("devicePixelRatio", 1);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => currentRect as DOMRect
    );

    ghosttySurfaceCreate = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceDestroy = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceBounds = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceVisible = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceFocus = vi.fn().mockResolvedValue(undefined);
    ghosttySurfaceConfig = vi.fn().mockResolvedValue(undefined);

    setShell(
      createFakeShell({
        ghosttySurfaceCreate,
        ghosttySurfaceDestroy,
        ghosttySurfaceBounds,
        ghosttySurfaceVisible,
        ghosttySurfaceFocus,
        ghosttySurfaceConfig,
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

    const { rerender } = render(<Harness sessionId={null} fontSize={13} visible={true} />);
    expect(ghosttySurfaceCreate).not.toHaveBeenCalled();

    rerender(<Harness sessionId="s1" fontSize={13} visible={true} />);

    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);
    expect(ghosttySurfaceCreate).toHaveBeenCalledWith({
      sessionId: "s1",
      bounds: { x: 10, y: 20, w: 800, h: 600 },
      fontSize: 13
    });
  });

  it("computes bounds at the current devicePixelRatio", () => {
    vi.stubGlobal("devicePixelRatio", 2);
    setRect({ left: 10, top: 20, width: 800, height: 600 });

    render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    expect(ghosttySurfaceCreate).toHaveBeenCalledWith({
      sessionId: "s1",
      bounds: { x: 20, y: 40, w: 1600, h: 1200 },
      fontSize: 13
    });
  });

  it("does not create a surface while the container has no rect yet", () => {
    setRect({ left: 0, top: 0, width: 0, height: 0 });
    render(<Harness sessionId="s1" fontSize={13} visible={true} />);
    expect(ghosttySurfaceCreate).not.toHaveBeenCalled();
  });

  it("(b) debounces ResizeObserver/scroll-driven bounds updates to one per animation frame", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    try {
      setRect({ left: 0, top: 0, width: 800, height: 600 });
      render(<Harness sessionId="s1" fontSize={13} visible={true} />);
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
    const { unmount } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

    unmount();

    expect(ghosttySurfaceDestroy).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("(d) invokes onGrid for a grid event addressed to this session", () => {
    const onGrid = vi.fn();
    render(<Harness sessionId="s1" fontSize={13} visible={true} onGrid={onGrid} />);

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
    render(<Harness sessionId="s1" fontSize={13} visible={true} onChord={onChord} />);

    act(() => {
      ghosttyEventListener?.({ kind: "chord", sessionId: "s1", chord: "ctrl+shift+d" });
    });

    expect(onChord).toHaveBeenCalledWith("ctrl+shift+d");
  });

  it("(f) flips focused on focusGained/focusLost events for this session", () => {
    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);
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
    render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TERMINAL_FOCUS_REQUEST_EVENT, { detail: { sessionId: "s1" } })
      );
    });

    expect(ghosttySurfaceFocus).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("(g) ignores a focus request targeting a different session", () => {
    render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TERMINAL_FOCUS_REQUEST_EVENT, { detail: { sessionId: "other" } })
      );
    });

    expect(ghosttySurfaceFocus).not.toHaveBeenCalled();
  });

  it("(h) syncs visibility from the `visible` prop, including its initial value on mount", () => {
    // Fix 1 (review round 1): IntersectionObserver cannot see this app's tab
    // switching — Workspace.tsx hides inactive tabs with `visibility:
    // hidden`, which keeps the full layout rect (IO computes from geometry
    // only), so every tab would report isIntersecting:true forever. main
    // must instead be told directly from the `isVisible` prop TerminalPane
    // already threads down from Workspace.tsx.
    const { rerender } = render(<Harness sessionId="s1" fontSize={13} visible={false} />);

    // Mount with visible=false must push false immediately, not wait for a
    // later flip — main otherwise assumes a fresh surface is visible.
    expect(ghosttySurfaceVisible).toHaveBeenCalledTimes(1);
    expect(ghosttySurfaceVisible).toHaveBeenCalledWith({ sessionId: "s1", visible: false });

    rerender(<Harness sessionId="s1" fontSize={13} visible={true} />);
    expect(ghosttySurfaceVisible).toHaveBeenCalledTimes(2);
    expect(ghosttySurfaceVisible).toHaveBeenLastCalledWith({ sessionId: "s1", visible: true });

    rerender(<Harness sessionId="s1" fontSize={13} visible={false} />);
    expect(ghosttySurfaceVisible).toHaveBeenCalledTimes(3);
    expect(ghosttySurfaceVisible).toHaveBeenLastCalledWith({ sessionId: "s1", visible: false });
  });

  it("(h) does not call ghosttySurfaceVisible before there is a session", () => {
    render(<Harness sessionId={null} fontSize={13} visible={false} />);
    expect(ghosttySurfaceVisible).not.toHaveBeenCalled();
  });

  it("title flow: a title event writes the sanitized title to layoutStore", () => {
    const setTabDynamicTitle = vi.spyOn(layoutStore.getState(), "setTabDynamicTitle");
    render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    act(() => {
      ghosttyEventListener?.({ kind: "title", sessionId: "s1", title: "  hello   world  " });
    });

    expect(setTabDynamicTitle).toHaveBeenCalledWith("s1", "hello world");
  });

  it("focusGained activates the pane holding the session, since the click never reaches the DOM", () => {
    const focusSession = vi.spyOn(layoutStore.getState(), "focusSession");
    render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    act(() => {
      ghosttyEventListener?.({ kind: "focusGained", sessionId: "s1" });
    });

    expect(focusSession).toHaveBeenCalledWith("s1");
  });

  it("a font-size change pushes a per-surface config for the running surface", () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    const { rerender } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    // Created with 13: the create call already carried it, so nothing else to push.
    expect(ghosttySurfaceConfig).not.toHaveBeenCalled();

    rerender(<Harness sessionId="s1" fontSize={16} visible={true} />);

    expect(ghosttySurfaceConfig).toHaveBeenCalledTimes(1);
    expect(ghosttySurfaceConfig).toHaveBeenCalledWith({
      sessionId: "s1",
      config: "font-size = 16"
    });
  });

  it("a crashed event surfaces an error and the retry recreates the surface", () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

    act(() => {
      ghosttyEventListener?.({ kind: "crashed", sessionId: "s1", error: "host exited" });
    });
    expect(getByTestId("surface-error").textContent).toBe("host exited");

    act(() => {
      getByTestId("retry-btn").click();
    });

    expect(getByTestId("surface-error").textContent).toBe("null");
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(2);
  });

  it("a create rejection surfaces the rejection message, and a successful retry clears it", async () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    ghosttySurfaceCreate.mockRejectedValueOnce(
      new Error("ghostty is unavailable: the host process path could not be resolved (see GHOSTTY_HOST_PATH)")
    );

    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(getByTestId("surface-error").textContent).toBe(
        "ghostty is unavailable: the host process path could not be resolved (see GHOSTTY_HOST_PATH)"
      )
    );

    ghosttySurfaceCreate.mockResolvedValueOnce(undefined);
    act(() => {
      getByTestId("retry-btn").click();
    });

    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(getByTestId("surface-error").textContent).toBe("null"));
  });

  it("a create rejection with no message falls back to a generic error", async () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    ghosttySurfaceCreate.mockRejectedValueOnce("boom");

    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    await waitFor(() =>
      expect(getByTestId("surface-error").textContent).toBe("terminal surface could not be created")
    );
  });

  it("a stale create resolving after the session switched does not clear the new session's error", async () => {
    setRect({ left: 0, top: 0, width: 800, height: 600 });
    const deferredS1 = createDeferred<void>();
    ghosttySurfaceCreate.mockReturnValueOnce(deferredS1.promise);

    const { getByTestId, rerender } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

    // Switch sessions while s1's create is still in flight: this destroys s1
    // and creates s2 (which resolves immediately via the default mock).
    rerender(<Harness sessionId="s2" fontSize={13} visible={true} />);
    expect(ghosttySurfaceDestroy).toHaveBeenCalledWith({ sessionId: "s1" });
    expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(2);

    // s2 gets a legitimate crash error before s1's stale create ever settles.
    act(() => {
      ghosttyEventListener?.({ kind: "crashed", sessionId: "s2", error: "s2 crashed" });
    });
    expect(getByTestId("surface-error").textContent).toBe("s2 crashed");

    // The stale s1 create resolves late — it must not wipe s2's error, since
    // it no longer owns surfaceSessionIdRef.
    await act(async () => {
      deferredS1.resolve(undefined);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getByTestId("surface-error").textContent).toBe("s2 crashed");
  });

  it("(then-path) an auto-retry via a resize tick — not the Retry button — clears the error on success", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    let getByTestId: (id: string) => HTMLElement;
    try {
      setRect({ left: 0, top: 0, width: 800, height: 600 });
      ({ getByTestId } = render(<Harness sessionId="s1" fontSize={13} visible={true} />));
      expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(1);

      act(() => {
        ghosttyEventListener?.({ kind: "crashed", sessionId: "s1", error: "host exited" });
      });
      expect(getByTestId("surface-error").textContent).toBe("host exited");

      // Drive the recovery through the ResizeObserver path (a real resize, or
      // the next tick after the surface died), never touching retrySurface()
      // — retrySurface() clears surfaceError synchronously itself, which
      // would pass even if the create-success `.then` clear were deleted.
      act(() => {
        resizeCallback?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
      });
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      expect(ghosttySurfaceCreate).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => expect(getByTestId("surface-error").textContent).toBe("null"));
  });

  it("focusSurface() calls ghosttySurfaceFocus for the current session", () => {
    const { getByTestId } = render(<Harness sessionId="s1" fontSize={13} visible={true} />);

    act(() => {
      getByTestId("focus-btn").click();
    });

    expect(ghosttySurfaceFocus).toHaveBeenCalledWith({ sessionId: "s1" });
  });
});
