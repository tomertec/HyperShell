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
