import { useId, useState } from "react";
import { useStore } from "zustand";
import { settingsStore } from "./settingsStore";
import type { TerminalTheme } from "../terminal/terminalTheme";
import { terminalThemes } from "../terminal/terminalTheme";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";

const THEME_KEYS: (keyof TerminalTheme)[] = [
  "background", "foreground", "cursor", "cursorAccent", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
];

function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function ThemeEditor({ onClose }: { onClose: () => void }) {
  const fieldId = useId();
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
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${fieldId}-name`} className="text-xs font-medium text-text-secondary">
          Theme Name
        </label>
        <Input
          id={`${fieldId}-name`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Theme"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${fieldId}-base`} className="text-xs font-medium text-text-secondary">
          Base Theme
        </label>
        <Select
          id={`${fieldId}-base`}
          value={baseTheme}
          onChange={(e) => handleBaseChange(e.target.value)}
        >
          {Object.keys(terminalThemes).map((key) => (
            <option key={key} value={key}>{formatLabel(key)}</option>
          ))}
        </Select>
      </div>

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

      <div className="flex items-center justify-end">
        <Button variant="primary" onClick={() => void handleSave()} disabled={!name.trim()}>
          Save Theme
        </Button>
      </div>
    </div>
  );
}
