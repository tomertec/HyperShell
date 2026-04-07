import { describe, expect, it } from "vitest";

import { getTerminalFontSizeAction } from "./terminalFontSize";

function input(
  key: string,
  {
    ctrlKey = false,
    metaKey = false,
    altKey = false,
    isMacLike = false
  }: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    isMacLike?: boolean;
  } = {}
) {
  return {
    event: { key, ctrlKey, metaKey, altKey },
    isMacLike
  };
}

describe("getTerminalFontSizeAction", () => {
  it("maps ctrl/cmd plus to increase", () => {
    expect(getTerminalFontSizeAction(input("=", { ctrlKey: true }))).toBe("increase");
    expect(getTerminalFontSizeAction(input("+", { ctrlKey: true }))).toBe("increase");
    expect(
      getTerminalFontSizeAction(input("+", { metaKey: true, isMacLike: true }))
    ).toBe("increase");
  });

  it("maps ctrl/cmd minus to decrease", () => {
    expect(getTerminalFontSizeAction(input("-", { ctrlKey: true }))).toBe("decrease");
    expect(getTerminalFontSizeAction(input("_", { ctrlKey: true }))).toBe("decrease");
    expect(
      getTerminalFontSizeAction(input("-", { metaKey: true, isMacLike: true }))
    ).toBe("decrease");
  });

  it("maps ctrl/cmd zero to reset", () => {
    expect(getTerminalFontSizeAction(input("0", { ctrlKey: true }))).toBe("reset");
    expect(
      getTerminalFontSizeAction(input("0", { metaKey: true, isMacLike: true }))
    ).toBe("reset");
  });

  it("ignores shortcuts when primary modifier is missing", () => {
    expect(getTerminalFontSizeAction(input("+"))).toBeNull();
    expect(getTerminalFontSizeAction(input("-", { metaKey: true }))).toBeNull();
    expect(
      getTerminalFontSizeAction(input("-", { ctrlKey: true, isMacLike: true }))
    ).toBeNull();
  });

  it("ignores shortcuts that include Alt", () => {
    expect(getTerminalFontSizeAction(input("+", { ctrlKey: true, altKey: true }))).toBeNull();
    expect(
      getTerminalFontSizeAction(
        input("-", { metaKey: true, altKey: true, isMacLike: true })
      )
    ).toBeNull();
  });
});
