import type { GhosttyResolvedThemeRequest, GhosttyUpdateConfigRequest } from "@hypershell/shared";
import { getShell, hasShell } from "../../lib/shell";
import type { AppSettings, settingsStore } from "../settings/settingsStore";
import { resolveTerminalTheme, terminalThemes, type TerminalTheme } from "./terminalTheme";

/**
 * Turns the terminal settings into the shape `ghostty:update-config` accepts,
 * and keeps main's copy current.
 *
 * Ghostty's config parser takes opaque `#rrggbb` only, while this app's themes
 * are xterm.js themes: selection backgrounds are `rgba()` alpha blends and
 * there is no selection foreground at all. Both are resolved here, in the one
 * place that knows the theme, rather than being invented in main.
 */

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB_FUNCTION = /^rgba?\(([^)]+)\)$/i;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseColor(value: string): Rgba | null {
  const input = value.trim();

  const short = HEX_SHORT.exec(input);
  if (short) {
    return {
      r: Number.parseInt(short[1] + short[1], 16),
      g: Number.parseInt(short[2] + short[2], 16),
      b: Number.parseInt(short[3] + short[3], 16),
      a: short[4] ? Number.parseInt(short[4] + short[4], 16) / 255 : 1
    };
  }

  const long = HEX_LONG.exec(input);
  if (long) {
    return {
      r: Number.parseInt(long[1], 16),
      g: Number.parseInt(long[2], 16),
      b: Number.parseInt(long[3], 16),
      a: long[4] ? Number.parseInt(long[4], 16) / 255 : 1
    };
  }

  const fn = RGB_FUNCTION.exec(input);
  if (fn) {
    const parts = fn[1].split(/[,/]/).map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) {
      return null;
    }
    const alpha = parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1;
    return {
      r: clampChannel(parts[0]),
      g: clampChannel(parts[1]),
      b: clampChannel(parts[2]),
      a: Math.max(0, Math.min(1, alpha))
    };
  }

  return null;
}

function toHexTriplet({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((channel) => clampChannel(channel).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Resolves any CSS color this app's themes can hold down to an opaque
 * `#rrggbb`, compositing a translucent one over `over` the way xterm.js paints
 * it. `fallback` covers a custom theme carrying a color string neither this nor
 * xterm.js can parse — a rejected IPC payload would drop the whole config.
 */
export function toOpaqueHex(value: string, over: string, fallback: string): string {
  const color = parseColor(value);
  if (!color) return fallback;
  if (color.a >= 1) return toHexTriplet(color);

  const backdrop = parseColor(over) ?? { r: 0, g: 0, b: 0, a: 1 };
  return toHexTriplet({
    r: color.r * color.a + backdrop.r * (1 - color.a),
    g: color.g * color.a + backdrop.g * (1 - color.a),
    b: color.b * color.a + backdrop.b * (1 - color.a)
  });
}

function relativeLuminance(hex: string): number {
  const color = parseColor(hex) ?? { r: 0, g: 0, b: 0, a: 1 };
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

/**
 * Ghostty needs an explicit selection foreground; xterm.js has none, because it
 * alpha-blends the selection over the text instead. The theme's own foreground
 * is the right answer whenever it stays readable on the resolved selection
 * background — when it doesn't, the background color is the contrasting one.
 */
export function pickSelectionForeground(
  selectionBackground: string,
  foreground: string,
  background: string
): string {
  const selectionLuminance = relativeLuminance(selectionBackground);
  const foregroundContrast = Math.abs(relativeLuminance(foreground) - selectionLuminance);
  const backgroundContrast = Math.abs(relativeLuminance(background) - selectionLuminance);
  return backgroundContrast > foregroundContrast ? background : foreground;
}

const PALETTE_ORDER = [
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
  "brightWhite"
] as const;

const FALLBACK_THEME = terminalThemes["default"];

export function resolveGhosttyTheme(theme: TerminalTheme): GhosttyResolvedThemeRequest {
  const background = toOpaqueHex(theme.background, FALLBACK_THEME.background, FALLBACK_THEME.background);
  const foreground = toOpaqueHex(theme.foreground, background, FALLBACK_THEME.foreground);
  const selectionBackground = toOpaqueHex(theme.selectionBackground, background, foreground);

  return {
    background,
    foreground,
    cursor: toOpaqueHex(theme.cursor, background, foreground),
    selectionBackground,
    selectionForeground: pickSelectionForeground(selectionBackground, foreground, background),
    palette: PALETTE_ORDER.map((key) =>
      toOpaqueHex(theme[key], background, FALLBACK_THEME[key])
    )
  };
}

export function buildGhosttyConfigRequest(settings: AppSettings): GhosttyUpdateConfigRequest {
  const { terminal } = settings;
  return {
    fontFamily: terminal.fontFamily,
    fontSize: terminal.fontSize,
    lineHeight: terminal.lineHeight,
    cursorBlink: terminal.cursorBlink,
    scrollback: terminal.scrollback,
    theme: resolveGhosttyTheme(resolveTerminalTheme(terminal.theme, settings.customThemes))
  };
}

function pushGhosttyConfig(settings: AppSettings): void {
  if (!hasShell()) return;
  void getShell()
    .ghosttyUpdateConfig(buildGhosttyConfigRequest(settings))
    .catch((error) => {
      console.warn("[hypershell] ghosttyUpdateConfig failed", error);
    });
}

/**
 * Keeps main's global ghostty config in step with the terminal settings.
 *
 * Pushes immediately on subscribe, before any surface exists, so the first tab
 * is created with the user's real font and theme; later pushes are a global
 * reload (surface 0), which reaches surfaces already on screen. Only the
 * terminal slice and the custom themes feed the config, so an unrelated
 * settings change (a sidebar toggle) doesn't reload every surface.
 */
export function syncGhosttySettingsToMain(store: typeof settingsStore): () => void {
  let lastTerminal = store.getState().settings.terminal;
  let lastCustomThemes = store.getState().settings.customThemes;
  pushGhosttyConfig(store.getState().settings);

  return store.subscribe((state) => {
    if (state.settings.terminal === lastTerminal && state.settings.customThemes === lastCustomThemes) {
      return;
    }
    lastTerminal = state.settings.terminal;
    lastCustomThemes = state.settings.customThemes;
    pushGhosttyConfig(state.settings);
  });
}
