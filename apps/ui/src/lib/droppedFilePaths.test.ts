import { describe, expect, it, afterEach, vi } from "vitest";

import { extractDroppedPaths, formatPathsForTerminal } from "./droppedFilePaths";

function fakeDataTransfer(files: File[]): DataTransfer {
  return { files } as unknown as DataTransfer;
}

function fakeFile(name: string): File {
  return { name } as unknown as File;
}

// The ui workspace runs in the node environment, so `window` is stubbed rather
// than provided by jsdom (same approach as settingsStore.test.ts).
function stubBridge(bridge: unknown): void {
  vi.stubGlobal("window", bridge === null ? {} : { hypershell: bridge });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("formatPathsForTerminal", () => {
  it("leaves a path without spaces bare", () => {
    expect(formatPathsForTerminal(["C:\\Users\\tomer\\notes.md"])).toBe(
      "C:\\Users\\tomer\\notes.md"
    );
  });

  it("quotes a path containing spaces", () => {
    expect(formatPathsForTerminal(["C:\\My Files\\report v2.pdf"])).toBe(
      '"C:\\My Files\\report v2.pdf"'
    );
  });

  it("joins multiple paths with a space, quoting only those that need it", () => {
    expect(formatPathsForTerminal(["C:\\a.txt", "C:\\My Files\\b.txt"])).toBe(
      'C:\\a.txt "C:\\My Files\\b.txt"'
    );
  });

  it("never appends a newline, so nothing auto-submits", () => {
    expect(formatPathsForTerminal(["C:\\a.txt"])).not.toContain("\n");
    expect(formatPathsForTerminal(["C:\\a.txt"])).not.toContain("\r");
  });

  it("returns an empty string for no paths", () => {
    expect(formatPathsForTerminal([])).toBe("");
  });
});

describe("extractDroppedPaths", () => {
  it("resolves each dropped file through the preload bridge", () => {
    const getPathForFile = vi.fn((file: File) => `C:\\drop\\${file.name}`);
    stubBridge({ getPathForFile });

    const paths = extractDroppedPaths(
      fakeDataTransfer([fakeFile("a.txt"), fakeFile("b.txt")])
    );

    expect(paths).toEqual(["C:\\drop\\a.txt", "C:\\drop\\b.txt"]);
    expect(getPathForFile).toHaveBeenCalledTimes(2);
  });

  it("drops files that have no path on disk", () => {
    stubBridge({
      getPathForFile: (file: File) => (file.name === "real.txt" ? "C:\\real.txt" : ""),
    });

    expect(
      extractDroppedPaths(fakeDataTransfer([fakeFile("blob"), fakeFile("real.txt")]))
    ).toEqual(["C:\\real.txt"]);
  });

  it("returns nothing when the preload bridge is unavailable", () => {
    stubBridge(null);

    expect(extractDroppedPaths(fakeDataTransfer([fakeFile("a.txt")]))).toEqual([]);
  });

  it("returns nothing when there is no dataTransfer", () => {
    stubBridge({ getPathForFile: () => "C:\\a.txt" });

    expect(extractDroppedPaths(null)).toEqual([]);
  });
});
