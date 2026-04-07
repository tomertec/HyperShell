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

  it("removeTarget removes a single session id", () => {
    const store = createBroadcastStore();
    store.getState().setTargets(["s1", "s2", "s3"]);
    store.getState().removeTarget("s2");
    expect(store.getState().targetSessionIds).toEqual(["s1", "s3"]);
  });

  it("removeTarget is a no-op for unknown session id", () => {
    const store = createBroadcastStore();
    store.getState().setTargets(["s1", "s2"]);
    const before = store.getState().targetSessionIds;
    store.getState().removeTarget("s99");
    expect(store.getState().targetSessionIds).toBe(before);
  });

  it("cleanTargets filters to only active session ids", () => {
    const store = createBroadcastStore();
    store.getState().setTargets(["s1", "s2", "s3"]);
    store.getState().cleanTargets(["s2", "s3", "s4"]);
    expect(store.getState().targetSessionIds).toEqual(["s2", "s3"]);
  });

  it("cleanTargets is a no-op when all targets are active", () => {
    const store = createBroadcastStore();
    store.getState().setTargets(["s1", "s2"]);
    const before = store.getState().targetSessionIds;
    store.getState().cleanTargets(["s1", "s2", "s3"]);
    expect(store.getState().targetSessionIds).toBe(before);
  });
});
