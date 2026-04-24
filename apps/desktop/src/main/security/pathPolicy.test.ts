import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertPathWithinAllowedRoots, isPathWithinRoot } from "./pathPolicy";

describe("pathPolicy", () => {
  it("accepts paths inside root boundaries", () => {
    const root = path.resolve(path.sep, "safe-root");
    const candidate = path.resolve(root, "Documents", "file.txt");
    expect(isPathWithinRoot(candidate, root)).toBe(true);
  });

  it("rejects sibling-prefix paths", () => {
    const root = path.resolve(path.sep, "safe-root");
    const siblingPrefix = path.resolve(path.sep, "safe-root-evil", "file.txt");
    expect(isPathWithinRoot(siblingPrefix, root)).toBe(false);
  });

  it("throws when no allowed root contains path", () => {
    const root = path.resolve(path.sep, "safe-root");
    const siblingPrefix = path.resolve(path.sep, "safe-root-evil", "file.txt");
    expect(() =>
      assertPathWithinAllowedRoots(siblingPrefix, [root], "outside")
    ).toThrow("outside");
  });
});
