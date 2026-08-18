import { describe, it, expect } from "vitest";
import { resolveTabTitle } from "./layoutStore";

describe("resolveTabTitle with the setting off", () => {
  it("falls back to the shell title when the process title is suppressed", () => {
    const tab = {
      sessionId: "s1",
      title: "PowerShell",
      dynamicTitle: "pwsh in projects",
      processTitle: "llmtop"
    };

    expect(resolveTabTitle(tab)).toBe("llmtop");
    expect(resolveTabTitle({ ...tab, processTitle: undefined })).toBe("pwsh in projects");
  });
});

describe("resolveTabTitle for self-titling processes", () => {
  it("prefers claude's own OSC topic title over the generic process name", () => {
    const tab = {
      sessionId: "s1",
      title: "PowerShell",
      dynamicTitle: "✳ Fixing tab titles",
      processTitle: "claude"
    };

    expect(resolveTabTitle(tab)).toBe("✳ Fixing tab titles");
  });

  it("falls back to the process name before claude has emitted a title", () => {
    const tab = {
      sessionId: "s1",
      title: "PowerShell",
      processTitle: "claude"
    };

    expect(resolveTabTitle(tab)).toBe("claude");
  });
});
