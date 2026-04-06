import { describe, expect, it } from "vitest";

import { createBroadcastStore } from "./broadcastStore";

describe("broadcastStore", () => {
  it("starts disabled with no targets", () => {
    const store = createBroadcastStore();

    expect(store.getState().enabled).toBe(false);
    expect(store.getState().targetSessionIds).toHaveLength(0);
  });

  it("deduplicates targets and toggles state", () => {
    const store = createBroadcastStore();

    store.getState().setTargets(["s1", "s1", "s2"]);
    store.getState().toggle();

    expect(store.getState().targetSessionIds).toEqual(["s1", "s2"]);
    expect(store.getState().enabled).toBe(true);
  });

  it("toggles broadcast on and off", () => {
    const store = createBroadcastStore();
    store.getState().toggle();
    expect(store.getState().enabled).toBe(true);
    store.getState().toggle();
    expect(store.getState().enabled).toBe(false);
  });

  it("deduplicates target session ids", () => {
    const store = createBroadcastStore();
    store.getState().setTargets(["s1", "s1", "s2"]);
    expect(store.getState().targetSessionIds).toEqual(["s1", "s2"]);
  });
});
