import { describe, expect, it } from "vitest";

import {
  terminalTheme,
  terminalThemes,
  resolveTerminalTheme,
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
