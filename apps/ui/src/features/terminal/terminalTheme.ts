import type { ITerminalOptions } from "@xterm/xterm";

export const terminalTheme = {
  background: "#07111f",
  foreground: "#e5eefb",
  cursor: "#7dd3fc",
  cursorAccent: "#07111f",
  selectionBackground: "rgba(125, 211, 252, 0.28)",
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
} as const;

export const terminalOptions: ITerminalOptions = {
  fontFamily:
    '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  cursorBlink: true,
  convertEol: true,
  allowTransparency: true,
  scrollback: 5000,
  theme: terminalTheme
};
