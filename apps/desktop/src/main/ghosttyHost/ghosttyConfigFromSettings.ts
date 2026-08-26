// Ghostty key names, value syntax, and formatEntry conventions verified
// against the ghostty source (src/config/Config.zig, src/cli/args.zig):
// scrollback-limit is a deprecated compat rename of scrollback-limit-bytes
// (Config.zig ~line 100-102), so we emit the current key directly. The
// LineIterator splits each line on the first '=' and trims the remainder,
// only stripping quotes when the whole value is wrapped in them (args.zig
// ~line 1469-1494) — a single font name with internal spaces needs none.
// font-family is a RepeatableString (Config.zig ~6113-6145), NOT a
// comma-separated StringList — its own doc comment says so explicitly
// ("I find that sometimes leads to confusion that it _accepts_ a list such
// as comma-separated values"): each `font-family =` line appends one whole
// fallback font to the list. We do the CSS-stack comma-splitting ourselves
// and emit one line per font. Palette lines follow Palette.formatEntry's own
// output shape: "N=#rrggbb" (Config.zig ~line 6013-6025), lowercase hex, one
// `palette = ` line per index 0-15 in the standard ANSI + bright-ANSI order.

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
  /** CSS-style font stack, e.g. `"Cascadia Mono", Consolas, monospace` —
   * the shape produced by apps/ui's font-family setting. */
  fontFamily: string;
  fontSize: number;
  /** xterm.js line-height multiplier (1.0 = no change). Optional; only
   * emitted when it differs from 1.0. `adjust-cell-height` is ghostty's
   * relative-delta unit rather than xterm's absolute multiplier, but the
   * conversion between the two (`(lineHeight - 1) * 100`) is exact, not a
   * lossy guess — unlike the scrollback bytes-per-line heuristic below. */
  lineHeight?: number;
  cursorBlink: boolean;
  /** Scrollback size in lines (xterm.js unit). */
  scrollback: number;
  theme: ResolvedGhosttyTheme;
}

// ghostty's scrollback-limit-bytes has no lines concept; this is an
// approximation, not a measured average row width.
const BYTES_PER_SCROLLBACK_LINE = 512;

// CSS font-stack syntax (settingsStore.ts's font-family setting) separates
// fallback fonts with commas and quotes names that contain spaces. Ghostty's
// font-family is a RepeatableString, not a StringList — see the header
// comment — so we split that CSS stack into one font-family line per entry
// ourselves. This is a plain comma split: a font name that itself contains a
// literal comma (quoted or not) isn't supported. None of this app's font
// choices do.
function parseFontFamilyList(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(stripCssQuotes);
}

function stripCssQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

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
  const lines: string[] = parseFontFamilyList(input.fontFamily).map(
    (font) => `font-family = ${font}`
  );
  lines.push(`font-size = ${input.fontSize}`);

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

// Mirrors apps/ui's DEFAULT_TERMINAL_SETTINGS and the "default" entry of
// terminalTheme.ts. The two cannot import each other (session-core/main has no
// renderer dependencies), so this is a deliberate copy: a surface created
// before the renderer's first ghosttyUpdateConfig push would otherwise be
// built with an empty config and render nothing recognisable. The renderer's
// push is authoritative and arrives moments later — surface 0 is a global
// reload, so it reaches surfaces already created with this blob.
//
// selectionBackground is the alpha blend the renderer computes for the same
// theme: rgba(125, 211, 252, 0.28) over #07111f.
const DEFAULT_GHOSTTY_THEME: ResolvedGhosttyTheme = {
  background: "#07111f",
  foreground: "#e5eefb",
  cursor: "#7dd3fc",
  selectionBackground: "#28475d",
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
  brightWhite: "#f8fafc"
};

export function defaultGhosttyConfig(): string {
  return ghosttyConfigFromSettings({
    fontFamily:
      '"Cascadia Mono", "Cascadia Code", Consolas, "IBM Plex Mono", "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 1.0,
    cursorBlink: true,
    scrollback: 5000,
    theme: DEFAULT_GHOSTTY_THEME
  });
}

/** The per-surface override a per-tab font size becomes (see
 *  composeGhosttySurfaceConfig for why it is never sent on its own). */
export function ghosttyFontSizeOverride(fontSize: number): string {
  return `font-size = ${fontSize}`;
}

/**
 * A surface's config REPLACES the global one rather than extending it — both
 * on createSurface (whose payload carries a whole config blob) and on
 * updateConfig for a non-zero surface id. So a per-surface override has to be
 * appended to the current global blob, not sent alone, or the surface would
 * lose its fonts, theme and scrollback. Ghostty's config parser takes the last
 * assignment of a scalar key, so the appended line wins.
 */
export function composeGhosttySurfaceConfig(globalBlob: string, override: string): string {
  if (!override) return globalBlob;
  if (!globalBlob) return override;
  return `${globalBlob}\n${override}`;
}
