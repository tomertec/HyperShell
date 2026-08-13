import { describe, expect, it } from "vitest";

import { extractSessionLabel } from "./claudeSessions";

function jsonl(...lines: unknown[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n");
}

describe("extractSessionLabel", () => {
  it("prefers the newest ai-title", () => {
    const tail = jsonl(
      { type: "ai-title", aiTitle: "An early guess", sessionId: "s" },
      { type: "assistant" },
      { type: "ai-title", aiTitle: "Address nightly triage issues", sessionId: "s" }
    );

    expect(extractSessionLabel(tail).title).toBe("Address nightly triage issues");
  });

  it("falls back to a user prompt when the session never earned a title", () => {
    const tail = jsonl(
      { type: "user", message: { content: "fix the drag and drop bug" } },
      { type: "assistant" }
    );

    expect(extractSessionLabel(tail).title).toBe("fix the drag and drop bug");
  });

  it("truncates a long fallback prompt", () => {
    const tail = jsonl({ type: "user", message: { content: "x".repeat(200) } });

    expect(extractSessionLabel(tail).title).toHaveLength(80);
  });

  it("picks up the working directory", () => {
    const tail = jsonl({ type: "assistant", cwd: "C:\\projects\\hypershell" });

    expect(extractSessionLabel(tail).cwd).toBe("C:\\projects\\hypershell");
  });

  it("survives the truncated first line of a mid-file read", () => {
    const tail = `{"type":"assis` + "\n" + jsonl({ type: "ai-title", aiTitle: "Still found" });

    expect(extractSessionLabel(tail).title).toBe("Still found");
  });

  it("returns nulls for an empty tail", () => {
    expect(extractSessionLabel("")).toEqual({ title: null, cwd: null });
  });

  it("ignores user lines whose content is structured rather than text", () => {
    const tail = jsonl({ type: "user", message: { content: [{ type: "tool_result" }] } });

    expect(extractSessionLabel(tail).title).toBeNull();
  });
});
