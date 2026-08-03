import { describe, expect, it } from "vitest";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import type { Terminal } from "@xterm/xterm";

import { getTerminalOptions } from "./terminalTheme";
import { TERMINAL_UNICODE_VERSION } from "./terminalUnicode";

type Provider = {
  version: string;
  wcwidth(codepoint: number): 0 | 1 | 2;
};

function registerProvider(): Provider {
  let provider: Provider | undefined;
  const terminal = {
    unicode: {
      register(candidate: Provider) {
        provider = candidate;
      }
    }
  } as unknown as Terminal;

  new UnicodeGraphemesAddon().activate(terminal);
  if (!provider) throw new Error("addon registered no Unicode provider");
  return provider;
}

describe("terminal Unicode version", () => {
  it("matches the version string the graphemes addon registers", () => {
    expect(registerProvider().version).toBe(TERMINAL_UNICODE_VERSION);
  });

  it("gives emoji the two columns the remote side reserves for them", () => {
    const provider = registerProvider();
    // xterm's built-in Unicode 6 table reports 1 for both, which shifts every
    // character after an emoji one cell left.
    expect(provider.wcwidth(0x2705)).toBe(2); // ✅
    expect(provider.wcwidth(0x1f680)).toBe(2); // 🚀
  });

  it("keeps allowProposedApi on, without which `terminal.unicode` throws", () => {
    expect(getTerminalOptions().allowProposedApi).toBe(true);
    expect(getTerminalOptions({ fontSize: 15 }).allowProposedApi).toBe(true);
  });

  it("leaves ASCII and box-drawing characters single width", () => {
    const provider = registerProvider();
    expect(provider.wcwidth(0x41)).toBe(1); // A
    // Box drawing is East Asian Ambiguous; widening it would break every
    // table just as badly as the emoji do today.
    expect(provider.wcwidth(0x2502)).toBe(1); // │
    expect(provider.wcwidth(0x2500)).toBe(1); // ─
  });
});
