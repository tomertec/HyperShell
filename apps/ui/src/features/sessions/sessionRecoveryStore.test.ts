import { describe, expect, it } from "vitest";

import { createSessionRecoveryStore } from "./sessionRecoveryStore";

describe("sessionRecoveryStore", () => {
  it("remembers sessions once", () => {
    const store = createSessionRecoveryStore();

    store.getState().remember("s1");
    store.getState().remember("s1");
    store.getState().remember("s2");

    expect(store.getState().recoverableSessionIds).toEqual(["s1", "s2"]);
  });

  it("forgets and clears sessions", () => {
    const store = createSessionRecoveryStore();

    store.getState().remember("s1");
    store.getState().remember("s2");
    store.getState().forget("s1");
    store.getState().clear();

    expect(store.getState().recoverableSessionIds).toEqual([]);
  });
});
