import { describe, it, expect } from "vitest";
import { pickForegroundName, type ProcessNode } from "./foregroundProcess";

const node = (name: string, children: ProcessNode[] = [], pid = 1): ProcessNode => ({
  pid,
  name,
  children
});

describe("pickForegroundName", () => {
  it("returns null when the shell has no children", () => {
    expect(pickForegroundName(node("pwsh.exe"))).toBeNull();
  });

  it("returns null for a missing tree", () => {
    expect(pickForegroundName(null)).toBeNull();
  });

  it("returns the deepest descendant, without the .exe suffix", () => {
    const tree = node("pwsh.exe", [node("llmtop.exe", [], 2)]);
    expect(pickForegroundName(tree)).toBe("llmtop");
  });

  it("prefers the deepest branch over a shallower sibling", () => {
    const tree = node("pwsh.exe", [
      node("node.exe", [], 2),
      node("git.exe", [node("less.exe", [], 4)], 3)
    ]);
    expect(pickForegroundName(tree)).toBe("less");
  });

  it("breaks depth ties toward the last child", () => {
    const tree = node("pwsh.exe", [node("first.exe", [], 2), node("second.exe", [], 3)]);
    expect(pickForegroundName(tree)).toBe("second");
  });

  it("returns null when the deepest process is itself a shell or wrapper", () => {
    expect(pickForegroundName(node("pwsh.exe", [node("conhost.exe", [], 2)]))).toBeNull();
    expect(pickForegroundName(node("cmd.exe", [node("bash.exe", [], 2)]))).toBeNull();
  });

  it("matches shell names case-insensitively", () => {
    expect(pickForegroundName(node("pwsh.exe", [node("PowerShell.EXE", [], 2)]))).toBeNull();
  });
});
