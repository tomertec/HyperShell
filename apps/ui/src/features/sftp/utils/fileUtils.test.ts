import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatFileSize,
  getFileIcon,
  sortEntries
} from "./fileUtils";

describe("fileUtils", () => {
  it("formats file sizes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1048576)).toBe("1.0 MB");
    expect(formatFileSize(1073741824)).toBe("1.0 GB");
  });

  it("formats dates", () => {
    const date = "2026-04-06T12:00:00.000Z";
    const result = formatDate(date);
    expect(result).toContain("2026");
  });

  it("returns correct file icons", () => {
    expect(getFileIcon("test.ts", false)).toBe("file-code");
    expect(getFileIcon("photo.png", false)).toBe("file-image");
    expect(getFileIcon("docs", true)).toBe("folder");
  });

  it("sorts entries by name ascending", () => {
    const entries = [
      { name: "banana", path: "/banana", size: 0, modifiedAt: "", isDirectory: false },
      { name: "apple", path: "/apple", size: 0, modifiedAt: "", isDirectory: true }
    ];
    const sorted = sortEntries(entries, "name", "asc");

    expect(sorted[0].name).toBe("apple");
    expect(sorted[1].name).toBe("banana");
  });
});
