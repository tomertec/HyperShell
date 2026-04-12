import { describe, it, expect, beforeEach } from "vitest";
import { useCommandPaletteStore } from "./commandPaletteStore";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

describe("commandPaletteStore", () => {
  beforeEach(() => {
    localStorageMock.clear();
    useCommandPaletteStore.setState({
      isOpen: false,
      recentIds: [],
    });
  });

  it("opens and closes", () => {
    const store = useCommandPaletteStore.getState();
    expect(store.isOpen).toBe(false);
    store.open();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
    store.close();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it("toggles", () => {
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it("records execution and caps at 5", () => {
    const store = useCommandPaletteStore.getState();
    store.recordExecution("a");
    store.recordExecution("b");
    store.recordExecution("c");
    store.recordExecution("d");
    store.recordExecution("e");
    store.recordExecution("f");
    const recents = useCommandPaletteStore.getState().recentIds;
    expect(recents).toEqual(["f", "e", "d", "c", "b"]);
    expect(recents).toHaveLength(5);
  });

  it("moves duplicates to front", () => {
    const store = useCommandPaletteStore.getState();
    store.recordExecution("a");
    store.recordExecution("b");
    store.recordExecution("c");
    store.recordExecution("a");
    expect(useCommandPaletteStore.getState().recentIds).toEqual(["a", "c", "b"]);
  });

  it("persists recents to localStorage", () => {
    useCommandPaletteStore.getState().recordExecution("x");
    const stored = JSON.parse(localStorageMock.getItem("hypershell:command-palette-recents")!);
    expect(stored).toEqual(["x"]);
  });
});
