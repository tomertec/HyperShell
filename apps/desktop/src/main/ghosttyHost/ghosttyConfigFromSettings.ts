// Ghostty key names, value syntax, and formatEntry conventions verified
// against the ghostty source (src/config/Config.zig, src/cli/args.zig):
// scrollback-limit is a deprecated compat rename of scrollback-limit-bytes
// (Config.zig ~line 100-102), so we emit the current key directly. The
// LineIterator splits each line on the first '=' and trims the remainder,
// only stripping quotes when the whole value is wrapped in them (args.zig
// ~line 1469-1494) — a font-family list with commas/spaces needs none.
// Palette lines follow Palette.formatEntry's own output shape: "N=#rrggbb"
// (Config.zig ~line 6013-6025), lowercase hex, one `palette = ` line per
// index 0-15 in the standard ANSI + bright-ANSI order.

export interface ResolvedGhosttyTheme {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface GhosttyConfigInput {
  fontFamily: string;
  fontSize: number;
  /** xterm.js line-height multiplier (1.0 = no change). Optional; only
   * emitted when it differs from 1.0, since ghostty's adjust-cell-height
   * is a relative delta, not an absolute multiplier. */
  lineHeight?: number;
  cursorBlink: boolean;
  /** Scrollback size in lines (xterm.js unit). */
  scrollback: number;
  theme: ResolvedGhosttyTheme;
}

// ghostty's scrollback-limit-bytes has no lines concept; this is an
// approximation, not a measured average row width.
const BYTES_PER_SCROLLBACK_LINE = 512;

const PALETTE_ORDER: Array<keyof ResolvedGhosttyTheme> = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

export function ghosttyConfigFromSettings(input: GhosttyConfigInput): string {
  const { theme } = input;
  const lines: string[] = [
    `font-family = ${input.fontFamily}`,
    `font-size = ${input.fontSize}`,
  ];

  if (input.lineHeight !== undefined && input.lineHeight !== 1.0) {
    const percent = Math.round((input.lineHeight - 1) * 100);
    lines.push(`adjust-cell-height = ${percent}%`);
  }

  lines.push(
    `cursor-style-blink = ${input.cursorBlink}`,
    `scrollback-limit-bytes = ${input.scrollback * BYTES_PER_SCROLLBACK_LINE}`,
    `background = ${theme.background}`,
    `foreground = ${theme.foreground}`,
    `cursor-color = ${theme.cursor}`,
    `selection-background = ${theme.selectionBackground}`,
    `selection-foreground = ${theme.selectionForeground}`
  );

  PALETTE_ORDER.forEach((key, index) => {
    lines.push(`palette = ${index}=${theme[key]}`);
  });

  return lines.join("\n");
}
