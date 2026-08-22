// @vitest-environment node
import { describe, expect, it } from "vitest";

import { resolveClaudeResumeSessionId } from "./claudeResumeTarget";

const ID = "5f6a1b2c-3d4e-4f50-8a1b-2c3d4e5f6a7b";
const shell = { claudeSession: false, claudeSessionMode: "continue" as const };

describe("resolveClaudeResumeSessionId", () => {
  it("resumes a conversation typed into a plain shell tab", () => {
    expect(
      resolveClaudeResumeSessionId({
        transport: "local",
        profile: shell,
        claudeSessionId: ID,
      })
    ).toBe(ID);
  });

  it("resumes a per-tab Claude profile by id", () => {
    expect(
      resolveClaudeResumeSessionId({
        transport: "local",
        profile: { claudeSession: true, claudeSessionMode: "new" },
        claudeSessionId: ID,
      })
    ).toBe(ID);
  });

  it("leaves a 'continue' Claude profile to resolve its own conversation", () => {
    expect(
      resolveClaudeResumeSessionId({
        transport: "local",
        profile: { claudeSession: true, claudeSessionMode: "continue" },
        claudeSessionId: ID,
      })
    ).toBeUndefined();
  });

  it("ignores remote tabs and tabs that were not running Claude", () => {
    expect(
      resolveClaudeResumeSessionId({ transport: "ssh", profile: shell, claudeSessionId: ID })
    ).toBeUndefined();
    expect(
      resolveClaudeResumeSessionId({
        transport: "local",
        profile: shell,
        claudeSessionId: undefined,
      })
    ).toBeUndefined();
    expect(
      resolveClaudeResumeSessionId({
        transport: "local",
        profile: undefined,
        claudeSessionId: ID,
      })
    ).toBeUndefined();
  });
});
