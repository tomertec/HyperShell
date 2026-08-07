import { describe, it, expect } from "vitest";
import { buildShellIntegrationBootstrap, looksLikePrompt } from "./bootstrap";

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

  it("appends __hs_post after existing PROMPT_COMMAND to preserve exit status", () => {
    expect(line).toContain("${PROMPT_COMMAND:+$PROMPT_COMMAND;}__hs_post");
  });

  it("emits an OSC 0 title sequence", () => {
    expect(line).toContain("\\033]0;");
  });

  describe("self-erasing echo", () => {
    function eraseRows(built: string): number {
      const match = built.match(/; printf '\\033\[(\d+)A\\r\\033\[J'\r$/);
      expect(match).not.toBeNull();
      return Number(match![1]);
    }

    it("ends with a printf that erases its own echoed rows", () => {
      expect(eraseRows(buildShellIntegrationBootstrap(80))).toBeGreaterThan(0);
    });

    it("erases enough rows to cover the echoed line at the given width", () => {
      for (const cols of [40, 80, 120, 200]) {
        const built = buildShellIntegrationBootstrap(cols);
        const echoedChars = built.length - 1; // trailing \r is not echoed as text
        expect(eraseRows(built)).toBeGreaterThanOrEqual(
          Math.floor(echoedChars / cols) + 2
        );
      }
    });

    it("scales the erase count with terminal width", () => {
      expect(eraseRows(buildShellIntegrationBootstrap(40))).toBeGreaterThan(
        eraseRows(buildShellIntegrationBootstrap(160))
      );
    });

    it("tolerates a nonsense width by falling back to a sane default", () => {
      expect(eraseRows(buildShellIntegrationBootstrap(0))).toBe(
        eraseRows(buildShellIntegrationBootstrap(80))
      );
    });

    it("keeps the erase sequence as literal printf escapes, not control chars", () => {
      const built = buildShellIntegrationBootstrap(80);
      expect(built.slice(0, -1)).not.toContain("\r"); // no early CR control char
      expect(built).not.toContain(String.fromCharCode(0x1b));
    });
  });
});

describe("looksLikePrompt", () => {
  const ESC = String.fromCharCode(0x1b);

  it("accepts a bash-style prompt with a trailing space", () => {
    expect(looksLikePrompt("tomer@docker:~$ ")).toBe(true);
  });

  it("accepts a prompt whose visible text is followed by escape sequences", () => {
    // oh-my-zsh: colored arrow prompt, then an OSC title and show-cursor.
    expect(
      looksLikePrompt(
        `${ESC}[32m${ESC}[1m➜  ${ESC}[36m~${ESC}[m ${ESC}]0;tomer@Docker: ~${ESC}[?25h`
      )
    ).toBe(true);
  });

  it("rejects output that ends with a newline (MOTD, banners)", () => {
    expect(looksLikePrompt("Last login: Mon Aug 3 from 10.10.10.11\r\n")).toBe(false);
  });

  it("rejects a newline followed only by escape sequences", () => {
    expect(looksLikePrompt(`You have new mail.\r\n${ESC}[?25h`)).toBe(false);
  });

  it("rejects an empty or escape-only tail — no output is not a prompt", () => {
    expect(looksLikePrompt("")).toBe(false);
    expect(looksLikePrompt(`${ESC}[?2004h${ESC}[?25h`)).toBe(false);
  });

  it("judges only the final line of a multi-line chunk", () => {
    expect(looksLikePrompt("[oh-my-zsh] It's time to update!\r\n➜  ~ ")).toBe(true);
  });
});
