import { describe, expect, it, vi } from "vitest";

import { applyClaudeSessionArgs } from "./claudeSessionArgs";

const NEW_ID = "11111111-2222-4333-8444-555555555555";
const RESUME_ID = "99999999-8888-4777-8666-555555555555";

describe("applyClaudeSessionArgs", () => {
  it("assigns a generated session id to a new Claude session", () => {
    const result = applyClaudeSessionArgs(
      { args: [], claudeSession: true, claudeSessionMode: "new" },
      undefined,
      () => NEW_ID
    );

    expect(result.args).toEqual(["--session-id", NEW_ID]);
    expect(result.claudeSessionId).toBe(NEW_ID);
  });

  it("resumes the requested session instead of generating one", () => {
    const generate = vi.fn(() => NEW_ID);
    const result = applyClaudeSessionArgs(
      { args: [], claudeSession: true, claudeSessionMode: "new" },
      RESUME_ID,
      generate
    );

    expect(result.args).toEqual(["--resume", RESUME_ID]);
    expect(result.claudeSessionId).toBe(RESUME_ID);
    expect(generate).not.toHaveBeenCalled();
  });

  it("appends to the profile's own args rather than replacing them", () => {
    const result = applyClaudeSessionArgs(
      { args: ["--dangerously-skip-permissions"], claudeSession: true, claudeSessionMode: "new" },
      undefined,
      () => NEW_ID
    );

    expect(result.args).toEqual(["--dangerously-skip-permissions", "--session-id", NEW_ID]);
  });

  it("leaves a non-Claude profile untouched", () => {
    const result = applyClaudeSessionArgs(
      { args: ["-NoLogo"], claudeSession: false, claudeSessionMode: "new" },
      undefined,
      () => NEW_ID
    );

    expect(result.args).toEqual(["-NoLogo"]);
    expect(result.claudeSessionId).toBeUndefined();
  });

  it("ignores a renderer-supplied resume id when the profile is not a Claude launcher", () => {
    // The flag is the only gate: without it, nothing the renderer sends can
    // reach the command line.
    const result = applyClaudeSessionArgs(
      { args: ["-NoLogo"], claudeSession: false, claudeSessionMode: "new" },
      RESUME_ID,
      () => NEW_ID
    );

    expect(result.args).toEqual(["-NoLogo"]);
    expect(result.args).not.toContain(RESUME_ID);
    expect(result.claudeSessionId).toBeUndefined();
  });

  it("does not mutate the profile's args array", () => {
    const args = ["-NoLogo"];
    applyClaudeSessionArgs({ args, claudeSession: true, claudeSessionMode: "new" }, undefined, () => NEW_ID);

    expect(args).toEqual(["-NoLogo"]);
  });
  it("continues the newest conversation for the folder in continue mode", () => {
    const generate = vi.fn(() => NEW_ID);
    const result = applyClaudeSessionArgs(
      { args: [], claudeSession: true, claudeSessionMode: "continue" },
      undefined,
      generate
    );

    expect(result.args).toEqual(["--continue"]);
    // Nothing to persist: --continue re-resolves the newest conversation on
    // every launch, so the tab needs no stored id to come back to it.
    expect(result.claudeSessionId).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
  });

  it("ignores a stored resume id in continue mode", () => {
    const result = applyClaudeSessionArgs(
      { args: [], claudeSession: true, claudeSessionMode: "continue" },
      RESUME_ID,
      () => NEW_ID
    );

    expect(result.args).toEqual(["--continue"]);
    expect(result.args).not.toContain(RESUME_ID);
  });

  it("keeps the profile's own args ahead of --continue", () => {
    const result = applyClaudeSessionArgs(
      { args: ["--dangerously-skip-permissions"], claudeSession: true, claudeSessionMode: "continue" },
      undefined,
      () => NEW_ID
    );

    expect(result.args).toEqual(["--dangerously-skip-permissions", "--continue"]);
  });
});
