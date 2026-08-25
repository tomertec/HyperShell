import { describe, expect, it } from "vitest";
import { ghosttyConfigFromSettings, type ResolvedGhosttyTheme } from "./ghosttyConfigFromSettings";

const theme: ResolvedGhosttyTheme = {
  background: "#07111f",
  foreground: "#e5eefb",
  cursor: "#7dd3fc",
  selectionBackground: "#264759",
  selectionForeground: "#e5eefb",
  black: "#0f172a",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#38bdf8",
  magenta: "#c084fc",
  cyan: "#2dd4bf",
  white: "#e2e8f0",
  brightBlack: "#334155",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#7dd3fc",
  brightMagenta: "#d8b4fe",
  brightCyan: "#5eead4",
  brightWhite: "#f8fafc",
};

describe("ghosttyConfigFromSettings", () => {
  it("emits the exact golden blob for a fixture input", () => {
    // Same CSS font stack as apps/ui's DEFAULT_TERMINAL_SETTINGS.fontFamily
    // (settingsStore.ts) — quoted multi-word names mixed with bare ones.
    const blob = ghosttyConfigFromSettings({
      fontFamily:
        '"Cascadia Mono", "Cascadia Code", Consolas, "IBM Plex Mono", "Liberation Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme,
    });

    expect(blob).toBe(
      [
        "font-family = Cascadia Mono",
        "font-family = Cascadia Code",
        "font-family = Consolas",
        "font-family = IBM Plex Mono",
        "font-family = Liberation Mono",
        "font-family = monospace",
        "font-size = 13",
        "cursor-style-blink = true",
        "scrollback-limit-bytes = 2560000",
        "background = #07111f",
        "foreground = #e5eefb",
        "cursor-color = #7dd3fc",
        "selection-background = #264759",
        "selection-foreground = #e5eefb",
        "palette = 0=#0f172a",
        "palette = 1=#ef4444",
        "palette = 2=#22c55e",
        "palette = 3=#eab308",
        "palette = 4=#38bdf8",
        "palette = 5=#c084fc",
        "palette = 6=#2dd4bf",
        "palette = 7=#e2e8f0",
        "palette = 8=#334155",
        "palette = 9=#f87171",
        "palette = 10=#4ade80",
        "palette = 11=#facc15",
        "palette = 12=#7dd3fc",
        "palette = 13=#d8b4fe",
        "palette = 14=#5eead4",
        "palette = 15=#f8fafc",
      ].join("\n")
    );
  });

  it("emits all 16 palette lines in order 0 through 15", () => {
    const blob = ghosttyConfigFromSettings({
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: false,
      scrollback: 1000,
      theme,
    });

    const expectedOrder = [
      theme.black,
      theme.red,
      theme.green,
      theme.yellow,
      theme.blue,
      theme.magenta,
      theme.cyan,
      theme.white,
      theme.brightBlack,
      theme.brightRed,
      theme.brightGreen,
      theme.brightYellow,
      theme.brightBlue,
      theme.brightMagenta,
      theme.brightCyan,
      theme.brightWhite,
    ];

    const paletteLines = blob.split("\n").filter((line) => line.startsWith("palette = "));
    expect(paletteLines).toHaveLength(16);
    paletteLines.forEach((line, index) => {
      expect(line).toBe(`palette = ${index}=${expectedOrder[index]}`);
    });
  });

  it("emits a single font name with spaces unquoted on its own line", () => {
    // Verified against the ghostty config LineIterator (src/cli/args.zig):
    // everything after the first '=' is trimmed and taken as the value
    // verbatim; quotes are only stripped when the *entire* trimmed value is
    // wrapped in them. A single font-family entry with internal spaces needs
    // no quoting once it's on its own `font-family =` line.
    const blob = ghosttyConfigFromSettings({
      fontFamily: "IBM Plex Mono",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme,
    });

    expect(blob.split("\n")[0]).toBe("font-family = IBM Plex Mono");
  });

  it("splits a CSS font stack into one font-family line per entry, stripping CSS quotes", () => {
    // font-family is a RepeatableString (Config.zig ~6113-6145), not a
    // comma-separated StringList — the config's own doc comment says so
    // explicitly. Each fallback font must be its own `font-family =` line.
    const blob = ghosttyConfigFromSettings({
      fontFamily: "'Fira Code', Menlo, \"DejaVu Sans Mono\"",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme,
    });

    const fontFamilyLines = blob.split("\n").filter((line) => line.startsWith("font-family = "));
    expect(fontFamilyLines).toEqual([
      "font-family = Fira Code",
      "font-family = Menlo",
      "font-family = DejaVu Sans Mono",
    ]);
  });

  it("converts scrollback lines to bytes at 512 bytes/line", () => {
    const blob = ghosttyConfigFromSettings({
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      theme,
    });

    expect(blob).toContain("scrollback-limit-bytes = 5120000");
  });

  it("maps a lineHeight different from 1.0 to adjust-cell-height as a percentage", () => {
    const blob = ghosttyConfigFromSettings({
      fontFamily: "monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme,
    });

    expect(blob).toContain("adjust-cell-height = 20%");
  });

  it("omits adjust-cell-height when lineHeight is 1.0 or unset", () => {
    const withDefault = ghosttyConfigFromSettings({
      fontFamily: "monospace",
      fontSize: 13,
      lineHeight: 1.0,
      cursorBlink: true,
      scrollback: 5000,
      theme,
    });
    const withUnset = ghosttyConfigFromSettings({
      fontFamily: "monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      theme,
    });

    expect(withDefault).not.toContain("adjust-cell-height");
    expect(withUnset).not.toContain("adjust-cell-height");
  });
});
