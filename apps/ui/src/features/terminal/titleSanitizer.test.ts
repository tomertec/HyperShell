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

  it("strips bidi override characters", () => {
    expect(sanitizeTitle("abc\u202egfedcba")).toBe("abcgfedcba");
  });

  it("strips zero-width characters", () => {
    expect(sanitizeTitle("a\u200bb\u200cc\u200dd\u2060e\u00adf")).toBe("abcdef");
  });

  it("leaves no trailing space after capping at 120 characters", () => {
    const raw = "x".repeat(119) + " " + "y".repeat(10);
    const result = sanitizeTitle(raw);
    expect(result).toHaveLength(119);
    expect(result?.endsWith(" ")).toBe(false);
  });

  it("does not bisect a surrogate pair at the 120-character cap", () => {
    const raw = "x".repeat(119) + "\ud83d\ude00"; // 119 chars + astral emoji straddling the cap
    const result = sanitizeTitle(raw);
    expect(result).toHaveLength(119);
    expect(result?.charCodeAt(result.length - 1)).not.toBeGreaterThanOrEqual(0xd800);
  });
});
