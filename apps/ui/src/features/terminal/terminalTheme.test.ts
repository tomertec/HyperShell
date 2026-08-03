import { describe, expect, it } from "vitest";

import {
  terminalTheme,
  terminalThemes,
  resolveTerminalTheme,
  getTerminalOptions,
  withGlyphFallback,
  type TerminalTheme
} from "./terminalTheme";

describe("terminalTheme", () => {
  it("defines background and foreground colors", () => {
    expect(terminalTheme.background).toBe("#07111f");
    expect(terminalTheme.foreground).toBe("#e5eefb");
  });
});

describe("resolveTerminalTheme", () => {
  it("returns default theme when no name given", () => {
    expect(resolveTerminalTheme()).toBe(terminalThemes["default"]);
  });

  it("returns built-in theme by name", () => {
    expect(resolveTerminalTheme("dracula")).toBe(terminalThemes["dracula"]);
  });

  it("returns default theme for unknown name", () => {
    expect(resolveTerminalTheme("nonexistent")).toBe(terminalThemes["default"]);
  });

  it("returns custom theme when provided", () => {
    const custom: TerminalTheme = {
      background: "#111111",
      foreground: "#eeeeee",
      cursor: "#eeeeee",
      cursorAccent: "#111111",
      selectionBackground: "rgba(255,255,255,0.3)",
      black: "#000000", red: "#ff0000", green: "#00ff00", yellow: "#ffff00",
      blue: "#0000ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff",
      brightBlack: "#808080", brightRed: "#ff0000", brightGreen: "#00ff00",
      brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff",
      brightCyan: "#00ffff", brightWhite: "#ffffff",
    };
    const result = resolveTerminalTheme("myCustom", { myCustom: custom });
    expect(result).toEqual(custom);
  });

  it("falls back to built-in when custom themes map lacks the name", () => {
    const result = resolveTerminalTheme("dracula", {});
    expect(result).toBe(terminalThemes["dracula"]);
  });

  it("custom theme takes priority over built-in with same name", () => {
    const custom: TerminalTheme = {
      background: "#999999",
      foreground: "#eeeeee",
      cursor: "#eeeeee",
      cursorAccent: "#999999",
      selectionBackground: "rgba(255,255,255,0.3)",
      black: "#000000", red: "#ff0000", green: "#00ff00", yellow: "#ffff00",
      blue: "#0000ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff",
      brightBlack: "#808080", brightRed: "#ff0000", brightGreen: "#00ff00",
      brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff",
      brightCyan: "#00ffff", brightWhite: "#ffffff",
    };
    const result = resolveTerminalTheme("dracula", { dracula: custom });
    expect(result).toEqual(custom);
    expect(result).not.toBe(terminalThemes["dracula"]);
  });
});

describe("withGlyphFallback", () => {
  it("adds Nerd Font fallbacks so prompt glyphs are not tofu", () => {
    const result = withGlyphFallback('"Cascadia Mono", Consolas, monospace');
    expect(result).toContain("Nerd Font");
  });

  it("inserts the fallbacks before the generic family", () => {
    // Anything listed after a generic like `monospace` is unreachable in
    // practice, so the fallbacks must come first.
    const result = withGlyphFallback('"Cascadia Mono", monospace');
    const parts = result.split(",").map((p) => p.trim());
    const generic = parts.indexOf("monospace");
    const nerd = parts.findIndex((p) => p.includes("Nerd Font"));
    expect(nerd).toBeGreaterThanOrEqual(0);
    expect(nerd).toBeLessThan(generic);
  });

  it("keeps the user's chosen family first so normal text is unchanged", () => {
    const result = withGlyphFallback('"Fira Code", monospace');
    expect(result.split(",")[0].trim()).toBe('"Fira Code"');
  });

  it("appends when the stack has no generic family", () => {
    const result = withGlyphFallback('"Fira Code"');
    expect(result.split(",")[0].trim()).toBe('"Fira Code"');
    expect(result).toContain("Nerd Font");
  });

  it("does not duplicate a fallback the user already chose", () => {
    const result = withGlyphFallback('"Hack Nerd Font Mono", monospace');
    const occurrences = result.match(/"Hack Nerd Font Mono"/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });
});

describe("getTerminalOptions font fallback", () => {
  it("applies the fallback to an explicitly chosen font", () => {
    const result = getTerminalOptions({ fontFamily: '"Fira Code", monospace' });
    expect(result.fontFamily).toContain("Fira Code");
    expect(result.fontFamily).toContain("Nerd Font");
  });

  it("applies the fallback to the default font when none is chosen", () => {
    const result = getTerminalOptions({});
    expect(result.fontFamily).toContain("Nerd Font");
  });
});
