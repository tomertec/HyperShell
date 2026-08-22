import { describe, expect, it } from "vitest";

import { buildClaudeResumeCommand, detectShellFamily } from "./claudeResumeCommand";

const ID = "5f6a1b2c-3d4e-4f50-8a1b-2c3d4e5f6a7b";

describe("detectShellFamily", () => {
  it("recognises the shells HyperShell detects on Windows", () => {
    expect(
      detectShellFamily("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
    ).toBe("powershell");
    expect(detectShellFamily("C:\\Program Files\\PowerShell\\7\\pwsh.exe")).toBe("powershell");
    expect(detectShellFamily("C:\\Windows\\System32\\cmd.exe")).toBe("cmd");
    expect(detectShellFamily("C:\\Program Files\\Git\\bin\\bash.exe")).toBe("posix");
    expect(detectShellFamily("C:\\Windows\\System32\\wsl.exe")).toBe("posix");
  });

  it("returns null for a shell whose quoting is unknown", () => {
    expect(detectShellFamily("C:\\tools\\nu.exe")).toBeNull();
  });
});

describe("buildClaudeResumeCommand", () => {
  it("changes directory and resumes in PowerShell", () => {
    expect(
      buildClaudeResumeCommand({
        executable: "pwsh.exe",
        claudeSessionId: ID,
        cwd: "C:\\Users\\tomer\\projects\\hypershell",
      })
    ).toBe(
      `Set-Location -LiteralPath 'C:\\Users\\tomer\\projects\\hypershell'; claude --resume ${ID}`
    );
  });

  it("uses cd /d in cmd so a cross-drive path actually moves", () => {
    expect(
      buildClaudeResumeCommand({
        executable: "cmd.exe",
        claudeSessionId: ID,
        cwd: "D:\\work",
      })
    ).toBe(`cd /d "D:\\work" && claude --resume ${ID}`);
  });

  it("escapes a quote in the path rather than ending the argument", () => {
    expect(
      buildClaudeResumeCommand({
        executable: "pwsh.exe",
        claudeSessionId: ID,
        cwd: "C:\\it's here",
      })
    ).toBe(`Set-Location -LiteralPath 'C:\\it''s here'; claude --resume ${ID}`);

    expect(
      buildClaudeResumeCommand({
        executable: "bash.exe",
        claudeSessionId: ID,
        cwd: "/home/it's",
      })
    ).toBe(`cd '/home/it'\\''s' && claude --resume ${ID}`);
  });

  it("resumes without moving when the path cannot be typed safely", () => {
    expect(
      buildClaudeResumeCommand({
        executable: "pwsh.exe",
        claudeSessionId: ID,
        cwd: "C:\\evil\nwhoami",
      })
    ).toBe(`claude --resume ${ID}`);

    expect(
      buildClaudeResumeCommand({
        executable: "cmd.exe",
        claudeSessionId: ID,
        cwd: 'C:\\a"b',
      })
    ).toBe(`claude --resume ${ID}`);

    expect(
      buildClaudeResumeCommand({ executable: "pwsh.exe", claudeSessionId: ID, cwd: null })
    ).toBe(`claude --resume ${ID}`);
  });

  it("refuses anything that is not a conversation id", () => {
    expect(
      buildClaudeResumeCommand({
        executable: "pwsh.exe",
        claudeSessionId: "; Remove-Item C:\\ -Recurse",
        cwd: null,
      })
    ).toBeNull();
  });

  it("refuses a shell it cannot quote for", () => {
    expect(
      buildClaudeResumeCommand({ executable: "nu.exe", claudeSessionId: ID, cwd: "C:\\x" })
    ).toBeNull();
  });
});
