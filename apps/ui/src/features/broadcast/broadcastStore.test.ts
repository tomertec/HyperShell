import { afterEach, describe, expect, it, vi } from "vitest";

import { createBroadcastStore, syncBroadcastStoreToMain } from "./broadcastStore";
import { setShell } from "../../lib/shell";
import { createFakeShell } from "../../lib/fakeShell";

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

describe("syncBroadcastStoreToMain", () => {
  afterEach(() => {
    setShell(null);
  });

  it("pushes the current state immediately on subscribe, even when it's non-default", () => {
    const setBroadcastTargets = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ setBroadcastTargets }).shell);

    const store = createBroadcastStore();
    // Mutate before syncing starts — main must learn this state right away,
    // not wait for the next toggle.
    store.getState().setTargets(["s1", "s2"]);
    store.getState().enable();

    syncBroadcastStoreToMain(store);

    expect(setBroadcastTargets).toHaveBeenCalledTimes(1);
    expect(setBroadcastTargets).toHaveBeenCalledWith({
      enabled: true,
      targetSessionIds: ["s1", "s2"]
    });
  });

  it("pushes again on every subsequent enabled/targetSessionIds change", () => {
    const setBroadcastTargets = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ setBroadcastTargets }).shell);

    const store = createBroadcastStore();
    syncBroadcastStoreToMain(store);
    expect(setBroadcastTargets).toHaveBeenCalledTimes(1);
    expect(setBroadcastTargets).toHaveBeenLastCalledWith({
      enabled: false,
      targetSessionIds: []
    });

    store.getState().toggle();
    expect(setBroadcastTargets).toHaveBeenCalledTimes(2);
    expect(setBroadcastTargets).toHaveBeenLastCalledWith({
      enabled: true,
      targetSessionIds: []
    });

    store.getState().setTargets(["s1"]);
    expect(setBroadcastTargets).toHaveBeenCalledTimes(3);
    expect(setBroadcastTargets).toHaveBeenLastCalledWith({
      enabled: true,
      targetSessionIds: ["s1"]
    });
  });

  it("does not push again for a no-op action (e.g. setTargets with an unchanged result)", () => {
    const setBroadcastTargets = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ setBroadcastTargets }).shell);

    const store = createBroadcastStore();
    store.getState().setTargets(["s1", "s1"]); // dedupes to ["s1"] before sync starts
    syncBroadcastStoreToMain(store);
    expect(setBroadcastTargets).toHaveBeenCalledTimes(1);

    store.getState().setTargets(["s1"]); // already exactly this — a no-op action
    expect(setBroadcastTargets).toHaveBeenCalledTimes(1);
  });

  it("stops pushing once the returned unsubscribe is called", () => {
    const setBroadcastTargets = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ setBroadcastTargets }).shell);

    const store = createBroadcastStore();
    const unsubscribe = syncBroadcastStoreToMain(store);
    expect(setBroadcastTargets).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.getState().toggle();
    expect(setBroadcastTargets).toHaveBeenCalledTimes(1);
  });

  it("does not throw and does not call the shell when no shell is configured", () => {
    setShell(null);
    const store = createBroadcastStore();

    expect(() => syncBroadcastStoreToMain(store)).not.toThrow();
    expect(() => store.getState().toggle()).not.toThrow();
  });
});
