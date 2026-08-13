import { describe, expect, it } from "vitest";

import { isVersionMismatch } from "./sftpIpc";

describe("isVersionMismatch", () => {
  const base = { size: 100, modifiedAt: "2026-08-13T00:00:00.000Z" };

  it("returns false when size and modifiedAt both match", () => {
    expect(isVersionMismatch({ ...base }, { ...base })).toBe(false);
  });

  it("returns true when size differs", () => {
    expect(isVersionMismatch({ ...base, size: 101 }, base)).toBe(true);
  });

  it("returns true when modifiedAt differs", () => {
    expect(isVersionMismatch({ ...base, modifiedAt: "2026-08-13T00:00:01.000Z" }, base)).toBe(true);
  });

  it("returns true when both size and modifiedAt differ", () => {
    expect(
      isVersionMismatch({ size: 999, modifiedAt: "2020-01-01T00:00:00.000Z" }, base)
    ).toBe(true);
  });
});
