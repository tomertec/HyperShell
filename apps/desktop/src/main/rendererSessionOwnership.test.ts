import { describe, expect, it } from "vitest";

import {
  createRendererSessionOwnership,
  type NavigationDetails,
  type ReapableRenderer,
} from "./rendererSessionOwnership";

function createFakeRenderer(id: number) {
  const listeners = new Map<string, Array<(details: NavigationDetails) => void>>();

  const renderer = {
    id,
    isDestroyed: () => false,
    on(event: string, listener: (details: NavigationDetails) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return renderer;
    },
    emit(event: string, details: NavigationDetails = mainFrameReload()) {
      for (const listener of listeners.get(event) ?? []) {
        listener(details);
      }
    },
  };

  return renderer;
}

function mainFrameReload() {
  return { isMainFrame: true, isSameDocument: false };
}

describe("renderer session ownership", () => {
  it("closes every session the renderer opened when it navigates away", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));
    const renderer = createFakeRenderer(7);
    ownership.watch(renderer);

    ownership.remember(7, "session-1");
    ownership.remember(7, "session-2");
    renderer.emit("did-start-navigation", mainFrameReload());

    expect(closed).toEqual(["session-1", "session-2"]);
  });

  it("keeps sessions on a same-document navigation", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));
    const renderer = createFakeRenderer(7);
    ownership.watch(renderer);

    ownership.remember(7, "session-1");
    renderer.emit("did-start-navigation", { isMainFrame: true, isSameDocument: true });

    expect(closed).toEqual([]);
  });

  it("keeps sessions when a subframe navigates", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));
    const renderer = createFakeRenderer(7);
    ownership.watch(renderer);

    ownership.remember(7, "session-1");
    renderer.emit("did-start-navigation", { isMainFrame: false, isSameDocument: false });

    expect(closed).toEqual([]);
  });

  it("closes the renderer's sessions when its process is gone", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));
    const renderer = createFakeRenderer(7);
    ownership.watch(renderer);

    ownership.remember(7, "session-1");
    renderer.emit("render-process-gone");

    expect(closed).toEqual(["session-1"]);
  });

  it("closes the renderer's sessions when it is destroyed", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));
    const renderer = createFakeRenderer(7);
    ownership.watch(renderer);

    ownership.remember(7, "session-1");
    renderer.emit("destroyed");

    expect(closed).toEqual(["session-1"]);
  });

  it("subscribes to a renderer once however often it is watched", () => {
    let navigationListeners = 0;
    const renderer = {
      id: 7,
      isDestroyed: () => false,
      on(event: string) {
        if (event === "did-start-navigation") {
          navigationListeners += 1;
        }
        return this;
      },
    } as unknown as ReapableRenderer;
    const ownership = createRendererSessionOwnership(() => {});

    ownership.watch(renderer);
    ownership.watch(renderer);

    expect(navigationListeners).toBe(1);
  });

  it("forgets a destroyed renderer's id so the watched set cannot grow forever", () => {
    const ownership = createRendererSessionOwnership(() => {});
    const first = createFakeRenderer(7);
    ownership.watch(first);
    first.emit("destroyed");

    // Electron never reuses a destroyed WebContents id in practice; a second
    // watch of the same id is the observable stand-in proving the id was
    // pruned — a retained id would make this watch a silent no-op.
    let navigationListeners = 0;
    const second = {
      id: 7,
      isDestroyed: () => false,
      on(event: string) {
        if (event === "did-start-navigation") {
          navigationListeners += 1;
        }
        return this;
      },
    } as unknown as ReapableRenderer;

    ownership.watch(second);

    expect(navigationListeners).toBe(1);
  });

  it("leaves another renderer's sessions alone", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));

    ownership.remember(7, "session-1");
    ownership.remember(9, "session-2");
    ownership.reap(7);

    expect(closed).toEqual(["session-1"]);
  });

  it("does not re-close a session that was already closed by its tab", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));

    ownership.remember(7, "session-1");
    ownership.forget("session-1");
    ownership.reap(7);

    expect(closed).toEqual([]);
  });

  it("reaps a renderer only once", () => {
    const closed: string[] = [];
    const ownership = createRendererSessionOwnership((id) => closed.push(id));

    ownership.remember(7, "session-1");
    ownership.reap(7);
    ownership.reap(7);

    expect(closed).toEqual(["session-1"]);
  });
});
