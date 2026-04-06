import { describe, expect, it } from "vitest";

import { isOnePasswordReference } from "./opResolver";

describe("opResolver", () => {
  it("detects op references", () => {
    expect(isOnePasswordReference("op://vault/item/field")).toBe(true);
  });
});
