import { describe, expect, it, vi } from "vitest";

import { isVersionMismatch, readVersionToken } from "./sftpIpc";

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

describe("readVersionToken", () => {
  it("returns the stat's size and mtime", async () => {
    const transport = {
      stat: vi.fn().mockResolvedValue({ size: 42, modifiedAt: "2026-08-13T00:00:00.000Z" }),
    };

    expect(await readVersionToken(transport as never, "/etc/hosts")).toEqual({
      size: 42,
      modifiedAt: "2026-08-13T00:00:00.000Z",
    });
  });

  it("returns nulls when the server refuses to stat", async () => {
    const transport = { stat: vi.fn().mockRejectedValue(new Error("permission denied")) };

    // A server that permits read but refuses stat must not make the file
    // unopenable — the version token is what's lost, not the content.
    expect(await readVersionToken(transport as never, "/etc/hosts")).toEqual({
      size: null,
      modifiedAt: null,
    });
  });
});
