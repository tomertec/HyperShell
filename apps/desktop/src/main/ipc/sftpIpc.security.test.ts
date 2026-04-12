import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSafeDragOutPath } from "./sftpIpc";

describe("resolveSafeDragOutPath", () => {
  it("keeps valid filenames inside the temp directory", () => {
    const tempDir = path.join("tmp", "hypershell-drag");
    const result = resolveSafeDragOutPath(tempDir, "server.log");
    expect(result).toBe(path.resolve(tempDir, "server.log"));
  });

  it("rejects traversal and path separator payloads", () => {
    expect(() => resolveSafeDragOutPath("/tmp/hypershell-drag", "../escape.txt")).toThrow(/invalid drag-out filename/i);
    expect(() => resolveSafeDragOutPath("/tmp/hypershell-drag", "nested/escape.txt")).toThrow(/invalid drag-out filename/i);
  });
});
