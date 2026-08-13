import { describe, expect, it } from "vitest";

import { createRequestGuard } from "../utils/requestGuard";

describe("createRequestGuard", () => {
  it("treats the newest request as current", () => {
    const guard = createRequestGuard();

    const first = guard.begin();
    const second = guard.begin();

    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });

  it("keeps a single request current until superseded", () => {
    const guard = createRequestGuard();
    const token = guard.begin();

    expect(guard.isCurrent(token)).toBe(true);
    expect(guard.isCurrent(token)).toBe(true);
  });
});
