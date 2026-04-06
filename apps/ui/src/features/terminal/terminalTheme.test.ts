import { describe, expect, it } from "vitest";

import { terminalTheme } from "./terminalTheme";

describe("terminalTheme", () => {
  it("defines background and foreground colors", () => {
    expect(terminalTheme.background).toBe("#07111f");
    expect(terminalTheme.foreground).toBe("#e5eefb");
  });
});
