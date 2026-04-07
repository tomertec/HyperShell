import { useState } from "react";
import { useStore } from "zustand";
import { settingsStore } from "./settingsStore";
import type { TerminalTheme } from "../terminal/terminalTheme";
import { terminalThemes } from "../terminal/terminalTheme";

const THEME_KEYS: (keyof TerminalTheme)[] = [
  "background", "foreground", "cursor", "cursorAccent", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20";

function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function ThemeEditor({ onClose }: { onClose: () => void }) {
  const saveCustomTheme = useStore(settingsStore, (s) => s.saveCustomTheme);
  const [name, setName] = useState("");
  const [baseTheme, setBaseTheme] = useState("default");
  const [colors, setColors] = useState<TerminalTheme>({ ...terminalThemes["default"] });

  const handleBaseChange = (key: string) => {
    setBaseTheme(key);
    setColors({ ...terminalThemes[key] });
  };

  const handleColorChange = (key: keyof TerminalTheme, value: string) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await saveCustomTheme(trimmed, colors);
    onClose();
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">New Custom Theme</span>
        <button
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
      </div>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Theme Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Theme"
          className={inputClasses}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Base Theme</span>
        <select
          value={baseTheme}
          onChange={(e) => handleBaseChange(e.target.value)}
          className={inputClasses}
        >
          {Object.keys(terminalThemes).map((key) => (
            <option key={key} value={key}>{formatLabel(key)}</option>
          ))}
        </select>
      </label>

      {/* Preview strip */}
      <div
        className="rounded-lg p-3 font-mono text-xs leading-relaxed border border-border"
        style={{ background: colors.background, color: colors.foreground }}
      >
        <span style={{ color: colors.green }}>user@host</span>
        <span style={{ color: colors.white }}>:</span>
        <span style={{ color: colors.blue }}>~/project</span>
        <span style={{ color: colors.white }}>$ </span>
        <span style={{ color: colors.yellow }}>echo</span>
        <span style={{ color: colors.red }}> &quot;hello&quot;</span>
        <br />
        <span style={{ color: colors.cyan }}>hello</span>
      </div>

      {/* Color grid */}
      <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
        {THEME_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="color"
              value={colors[key].startsWith("rgba") ? "#808080" : colors[key]}
              onChange={(e) => handleColorChange(key, e.target.value)}
              className="h-6 w-6 rounded border border-border cursor-pointer bg-transparent"
            />
            <span className="text-xs text-text-secondary truncate">{formatLabel(key)}</span>
          </label>
        ))}
      </div>

      <button
        onClick={() => void handleSave()}
        disabled={!name.trim()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Save Theme
      </button>
    </div>
  );
}
