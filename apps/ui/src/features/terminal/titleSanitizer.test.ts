import { describe, expect, it } from "vitest";
import { sanitizeTitle } from "./titleSanitizer";

describe("sanitizeTitle", () => {
  it("passes ordinary titles through", () => {
    expect(sanitizeTitle("pwsh in hypershell")).toBe("pwsh in hypershell");
  });

  it("strips C0/C1 control characters", () => {
    expect(sanitizeTitle("evil\u0007title\u001b[31m")).toBe("eviltitle[31m");
  });

  it("collapses whitespace runs and trims", () => {
    expect(sanitizeTitle("  a \t b\n\nc  ")).toBe("a b c");
  });

  it("caps length at 120 characters", () => {
    expect(sanitizeTitle("x".repeat(300))).toHaveLength(120);
  });

  it("returns null for empty or whitespace-only input", () => {
    expect(sanitizeTitle("")).toBeNull();
    expect(sanitizeTitle("   \t ")).toBeNull();
    expect(sanitizeTitle("\u0007\u001b")).toBeNull();
  });
});
