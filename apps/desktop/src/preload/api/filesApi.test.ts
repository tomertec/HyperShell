import { describe, expect, it, vi } from "vitest";

import { createFilesApi } from "./filesApi";

const file = { name: "notes.md" } as unknown as File;

describe("createFilesApi", () => {
  it("delegates to the injected resolver", () => {
    const getPathForFile = vi.fn(() => "C:\\Users\\tomer\\notes.md");

    expect(createFilesApi({ getPathForFile }).getPathForFile(file)).toBe(
      "C:\\Users\\tomer\\notes.md"
    );
    expect(getPathForFile).toHaveBeenCalledWith(file);
  });

  it("returns an empty path when no resolver is available", () => {
    expect(createFilesApi(null).getPathForFile(file)).toBe("");
  });

  it("returns an empty path when the resolver throws", () => {
    const resolver = {
      getPathForFile: () => {
        throw new Error("not a real file");
      },
    };

    expect(createFilesApi(resolver).getPathForFile(file)).toBe("");
  });
});
