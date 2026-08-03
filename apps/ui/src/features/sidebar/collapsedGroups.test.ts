import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCollapsedGroups, saveCollapsedGroups } from "./collapsedGroups";

function stubLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

describe("collapsedGroups persistence", () => {
  const original = globalThis.localStorage;

  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: stubLocalStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it("round-trips a set of group names", () => {
    saveCollapsedGroups(new Set(["Production", "Ungrouped"]));
    expect(loadCollapsedGroups()).toEqual(new Set(["Production", "Ungrouped"]));
  });

  it("returns an empty set when nothing is stored", () => {
    expect(loadCollapsedGroups()).toEqual(new Set());
  });

  it("returns an empty set on corrupt data", () => {
    localStorage.setItem("hypershell.sidebar.collapsedGroups", "{not json");
    expect(loadCollapsedGroups()).toEqual(new Set());
  });
});
