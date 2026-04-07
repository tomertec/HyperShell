import { describe, expect, it } from "vitest";

import { getTerminalClipboardAction } from "./terminalClipboard";

function input(
  key: string,
  {
    ctrlKey = false,
    metaKey = false,
    shiftKey = false,
    altKey = false,
    hasSelection = false,
    isMacLike = false
  }: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    hasSelection?: boolean;
    isMacLike?: boolean;
  } = {}
) {
  return {
    event: { key, ctrlKey, metaKey, shiftKey, altKey },
    hasSelection,
    isMacLike
  };
}

describe("getTerminalClipboardAction", () => {
  it("uses Ctrl+Shift+C / Ctrl+Shift+V on non-mac", () => {
    expect(
      getTerminalClipboardAction(input("c", { ctrlKey: true, shiftKey: true }))
    ).toBe("copy");
    expect(
      getTerminalClipboardAction(input("v", { ctrlKey: true, shiftKey: true }))
    ).toBe("paste");
  });

  it("does not map Ctrl+Shift+C/V on mac", () => {
    expect(
      getTerminalClipboardAction(input("c", { ctrlKey: true, shiftKey: true, isMacLike: true }))
    ).toBeNull();
    expect(
      getTerminalClipboardAction(input("v", { ctrlKey: true, shiftKey: true, isMacLike: true }))
    ).toBeNull();
  });

  it("supports Cmd+C / Cmd+V on mac", () => {
    expect(
      getTerminalClipboardAction(input("c", { metaKey: true, isMacLike: true }))
    ).toBe("copy");
    expect(
      getTerminalClipboardAction(input("v", { metaKey: true, isMacLike: true }))
    ).toBe("paste");
  });

  it("supports Shift+Insert paste and Ctrl+Insert copy", () => {
    expect(getTerminalClipboardAction(input("Insert", { shiftKey: true }))).toBe("paste");
    expect(getTerminalClipboardAction(input("Insert", { ctrlKey: true }))).toBe("copy");
  });

  it("allows Ctrl+C copy on non-mac only when selection exists", () => {
    expect(
      getTerminalClipboardAction(input("c", { ctrlKey: true, hasSelection: true }))
    ).toBe("copy");
    expect(
      getTerminalClipboardAction(input("c", { ctrlKey: true, hasSelection: false }))
    ).toBeNull();
  });

  it("supports Ctrl+V paste on non-mac", () => {
    expect(getTerminalClipboardAction(input("v", { ctrlKey: true }))).toBe("paste");
  });

  it("ignores shortcuts that include Alt", () => {
    expect(
      getTerminalClipboardAction(input("v", { ctrlKey: true, altKey: true }))
    ).toBeNull();
  });
});
