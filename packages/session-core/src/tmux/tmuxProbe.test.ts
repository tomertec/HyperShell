import { describe, it, expect } from "vitest";
import { parseTmuxListOutput } from "./tmuxProbe";

describe("parseTmuxListOutput", () => {
  it("parses a single detached session", () => {
    const output = "main|3|1712850000|0\n";
    const result = parseTmuxListOutput(output);
    expect(result).toEqual([
      {
        name: "main",
        windowCount: 3,
        createdAt: new Date(1712850000 * 1000),
        attached: false,
      },
    ]);
  });

  it("parses multiple sessions with mixed attached status", () => {
    const output = "dev|2|1712850000|1\nops|5|1712860000|0\n";
    const result = parseTmuxListOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("dev");
    expect(result[0].attached).toBe(true);
    expect(result[1].name).toBe("ops");
    expect(result[1].attached).toBe(false);
  });

  it("returns empty array for empty string", () => {
    expect(parseTmuxListOutput("")).toEqual([]);
  });

  it("returns empty array for whitespace-only output", () => {
    expect(parseTmuxListOutput("  \n  \n")).toEqual([]);
  });

  it("skips malformed lines gracefully", () => {
    const output = "good|2|1712850000|0\nbad-line\n||\nalso-good|1|1712860000|1\n";
    const result = parseTmuxListOutput(output);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("good");
    expect(result[1].name).toBe("also-good");
  });

  it("handles session names with special characters", () => {
    const output = "my-session_v2.0|1|1712850000|0\n";
    const result = parseTmuxListOutput(output);
    expect(result[0].name).toBe("my-session_v2.0");
  });
});
