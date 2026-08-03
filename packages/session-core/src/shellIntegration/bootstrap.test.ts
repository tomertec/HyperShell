import { describe, it, expect } from "vitest";
import { buildShellIntegrationBootstrap } from "./bootstrap";

describe("buildShellIntegrationBootstrap", () => {
  const line = buildShellIntegrationBootstrap();

  it("is a single line terminated by carriage return", () => {
    expect(line.endsWith("\r")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
    expect(line.slice(0, -1)).not.toContain("\r");
  });

  it("starts with a space so HISTCONTROL=ignorespace keeps it out of history", () => {
    expect(line.startsWith(" ")).toBe(true);
  });

  it("is guarded so a second injection is a no-op", () => {
    expect(line).toContain("__HS_SI");
  });

  it("handles both bash and zsh", () => {
    expect(line).toContain("ZSH_VERSION");
    expect(line).toContain("BASH_VERSION");
    expect(line).toContain("add-zsh-hook");
  });

  it("refuses to install over an existing DEBUG trap", () => {
    expect(line).toContain("trap -p DEBUG");
  });

  it("appends to PROMPT_COMMAND instead of replacing it", () => {
    expect(line).toContain("${PROMPT_COMMAND:+");
  });

  it("emits an OSC 0 title sequence", () => {
    expect(line).toContain("\\033]0;");
  });
});
