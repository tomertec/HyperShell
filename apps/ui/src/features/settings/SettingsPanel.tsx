import { useStore } from "zustand";
import { settingsStore } from "./settingsStore";
import { terminalThemes } from "../terminal/terminalTheme";

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "IBM Plex Mono", value: '"IBM Plex Mono", monospace' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", monospace' },
  { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Courier New", value: '"Courier New", monospace' },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10000, 25000, 50000];

function formatThemeName(key: string): string {
  // Convert camelCase to Title Case with spaces
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function SectionHeader({
  icon,
  label
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-accent">{icon}</span>
      <span className="text-sm font-semibold text-text-primary">{label}</span>
    </div>
  );
}

export function SettingsPanel() {
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);

  const { fontFamily, fontSize, lineHeight, cursorBlink, scrollback, theme } =
    settings.terminal;

  // Match the current fontFamily stack to a dropdown option
  const activeFontValue =
    FONT_OPTIONS.find((f) => fontFamily.includes(f.label))?.value ?? FONT_OPTIONS[0].value;

  return (
    <div className="max-w-lg grid gap-6">
      {/* Font Section */}
      <section>
        <SectionHeader
          icon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="2"
                y="13"
                fontSize="13"
                fontWeight="bold"
                fill="currentColor"
                fontFamily="serif"
              >
                A
              </text>
            </svg>
          }
          label="Font"
        />

        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              Font Family
            </span>
            <select
              value={activeFontValue}
              onChange={(e) => {
                void updateTerminal({ fontFamily: e.target.value });
              }}
              className={inputClasses}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              Font Size
            </span>
            <select
              value={fontSize}
              onChange={(e) => {
                void updateTerminal({ fontSize: Number(e.target.value) });
              }}
              className={inputClasses}
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}px
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              Line Height
            </span>
            <input
              type="number"
              min={1.0}
              max={2.0}
              step={0.1}
              value={lineHeight}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 1.0 && val <= 2.0) {
                  void updateTerminal({ lineHeight: val });
                }
              }}
              className={inputClasses}
            />
          </label>
        </div>
      </section>

      {/* Theme Section */}
      <section>
        <SectionHeader
          icon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="2.5" fill="currentColor" />
            </svg>
          }
          label="Theme"
        />

        <div className="grid grid-cols-2 gap-2">
          {Object.entries(terminalThemes).map(([key, themeObj]) => {
            const isActive = theme === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  void updateTerminal({ theme: key });
                }}
                className={[
                  "flex flex-col gap-2 rounded-lg border p-3 text-left transition-all duration-150",
                  isActive
                    ? "border-accent/40 bg-accent/10"
                    : "border-border bg-surface/60 hover:border-border-bright hover:bg-surface/80"
                ].join(" ")}
              >
                <div className="flex gap-1">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: themeObj.red }}
                  />
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: themeObj.green }}
                  />
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: themeObj.blue }}
                  />
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: themeObj.yellow }}
                  />
                </div>
                <span className="text-xs font-medium text-text-secondary">
                  {formatThemeName(key)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Behavior Section */}
      <section>
        <SectionHeader
          icon={
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="1.5"
                y="2.5"
                width="13"
                height="11"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M4 6l2 2-2 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 10h3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          }
          label="Behavior"
        />

        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              Cursor Blink
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={cursorBlink}
              onClick={() => {
                void updateTerminal({ cursorBlink: !cursorBlink });
              }}
              className={[
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-base-900",
                cursorBlink ? "bg-accent" : "bg-base-600"
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
                  cursorBlink ? "translate-x-4" : "translate-x-0.5"
                ].join(" ")}
              />
            </button>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              Scrollback Lines
            </span>
            <select
              value={scrollback}
              onChange={(e) => {
                void updateTerminal({ scrollback: Number(e.target.value) });
              }}
              className={inputClasses}
            >
              {SCROLLBACK_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
