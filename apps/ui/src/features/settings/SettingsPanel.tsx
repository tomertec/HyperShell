import { useState } from "react";
import { useStore } from "zustand";
import {
  MAX_TERMINAL_LETTER_SPACING,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LETTER_SPACING,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_FONT_SIZE,
  settingsStore
} from "./settingsStore";
import { terminalThemes } from "../terminal/terminalTheme";
import { ThemeEditor } from "./ThemeEditor";
import { SshKeyManager } from "../ssh-keys/SshKeyManager";
import { BackupRestorePanel } from "./BackupRestorePanel";

const inputClasses =
  "w-full rounded-lg border border-border bg-surface/80 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/60 transition-all duration-150 focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 focus:bg-surface hover:border-border-bright";

const FONT_OPTIONS: { label: string; value: string }[] = [
  {
    label: "Cascadia Mono",
    value: '"Cascadia Mono", "Cascadia Code", Consolas, "IBM Plex Mono", monospace'
  },
  { label: "IBM Plex Mono", value: '"IBM Plex Mono", Consolas, monospace' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { label: "Fira Code", value: '"Fira Code", monospace' },
  { label: "Cascadia Code", value: '"Cascadia Code", Consolas, monospace' },
  { label: "Source Code Pro", value: '"Source Code Pro", monospace' },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Courier New", value: '"Courier New", monospace' },
];

const FONT_SIZES = Array.from(
  { length: MAX_TERMINAL_FONT_SIZE - MIN_TERMINAL_FONT_SIZE + 1 },
  (_, index) => MIN_TERMINAL_FONT_SIZE + index
);

const SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10000, 25000, 50000];

function formatThemeName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

type SettingsCategory = "general" | "terminal" | "appearance" | "ssh-keys" | "backup";

const CATEGORIES: { id: SettingsCategory; label: string; icon: React.ReactNode }[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5a1.5 1.5 0 0 1 1.5 1.5v.34a5.5 5.5 0 0 1 1.3.75l.29-.17a1.5 1.5 0 0 1 2.05.55l.01.01a1.5 1.5 0 0 1-.55 2.05l-.3.17a5.5 5.5 0 0 1 0 1.5l.3.17a1.5 1.5 0 0 1 .54 2.06 1.5 1.5 0 0 1-2.05.55l-.3-.17a5.5 5.5 0 0 1-1.29.75V12a1.5 1.5 0 0 1-3 0v-.34a5.5 5.5 0 0 1-1.3-.75l-.29.17a1.5 1.5 0 0 1-2.05-.55l-.01-.01a1.5 1.5 0 0 1 .55-2.05l.3-.17a5.5 5.5 0 0 1 0-1.5l-.3-.17a1.5 1.5 0 0 1-.54-2.06 1.5 1.5 0 0 1 2.05-.55l.3.17a5.5 5.5 0 0 1 1.29-.75V3A1.5 1.5 0 0 1 8 1.5Z" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 6l2 2-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "ssh-keys",
    label: "SSH Keys",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M10 1a3 3 0 0 0-2.83 4L2 10.17V14h3.83L7 12.83V12h1v-1h1V9.83l.17-.17A3 3 0 0 0 10 1Zm1 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "backup",
    label: "Backup",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 13V3a1 1 0 011-1h6a1 1 0 011 1v10l-4-2.5L4 13Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-base-900",
        checked ? "bg-accent" : "bg-base-600",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

function GeneralSection() {
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateGeneral = useStore(settingsStore, (s) => s.updateGeneral);
  const { showRecordingButton, showRestoreBanner, showSerialInSidebar, confirmOnClose } = settings.general;

  return (
    <div className="grid gap-6">
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Session</h3>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Session Recording Button</div>
              <div className="text-xs text-text-muted">Show the recording button in terminal panes</div>
            </div>
            <ToggleSwitch
              checked={showRecordingButton}
              onChange={() => void updateGeneral({ showRecordingButton: !showRecordingButton })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Session Restore Prompt</div>
              <div className="text-xs text-text-muted">Show "Restore sessions from last session" on startup</div>
            </div>
            <ToggleSwitch
              checked={showRestoreBanner}
              onChange={() => void updateGeneral({ showRestoreBanner: !showRestoreBanner })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Serial Section in Sidebar</div>
              <div className="text-xs text-text-muted">Show serial profiles in the hosts sidebar list</div>
            </div>
            <ToggleSwitch
              checked={showSerialInSidebar}
              onChange={() => void updateGeneral({ showSerialInSidebar: !showSerialInSidebar })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Confirm on Close</div>
              <div className="text-xs text-text-muted">Ask for confirmation before closing with active sessions</div>
            </div>
            <ToggleSwitch
              checked={confirmOnClose}
              onChange={() => void updateGeneral({ confirmOnClose: !confirmOnClose })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalSection() {
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);
  const updateDebug = useStore(settingsStore, (s) => s.updateDebug);
  const { fontFamily, fontSize, lineHeight, letterSpacing, cursorBlink, scrollback } =
    settings.terminal;
  const authTracing = settings.debug.authTracing;

  const activeFontValue =
    FONT_OPTIONS.find((f) => fontFamily.includes(f.label))?.value ?? FONT_OPTIONS[0].value;

  return (
    <div className="grid gap-6">
      {/* Font */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Font</h3>
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Family</span>
            <select
              value={activeFontValue}
              onChange={(e) => void updateTerminal({ fontFamily: e.target.value })}
              className={inputClasses}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Size</span>
              <select
                value={fontSize}
                onChange={(e) => void updateTerminal({ fontSize: Number(e.target.value) })}
                className={inputClasses}
              >
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>{s}px</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-text-secondary">Line Height</span>
              <input
                type="number"
                min={MIN_TERMINAL_LINE_HEIGHT}
                max={MAX_TERMINAL_LINE_HEIGHT}
                step={0.05}
                value={lineHeight}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (
                    !isNaN(val) &&
                    val >= MIN_TERMINAL_LINE_HEIGHT &&
                    val <= MAX_TERMINAL_LINE_HEIGHT
                  ) {
                    void updateTerminal({ lineHeight: val });
                  }
                }}
                className={inputClasses}
              />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-text-secondary">Character Spacing</span>
            <input
              type="number"
              min={MIN_TERMINAL_LETTER_SPACING}
              max={MAX_TERMINAL_LETTER_SPACING}
              step={1}
              value={letterSpacing}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (
                  !Number.isNaN(val) &&
                  val >= MIN_TERMINAL_LETTER_SPACING &&
                  val <= MAX_TERMINAL_LETTER_SPACING
                ) {
                  void updateTerminal({ letterSpacing: val });
                }
              }}
              className={inputClasses}
            />
          </label>
        </div>
      </div>

      {/* Behavior */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Behavior</h3>
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-primary">Cursor Blink</div>
              <div className="text-xs text-text-muted">Animate the cursor in the terminal</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={cursorBlink}
              onClick={() => void updateTerminal({ cursorBlink: !cursorBlink })}
              className={[
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-base-900",
                cursorBlink ? "bg-accent" : "bg-base-600",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
                  cursorBlink ? "translate-x-4" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm text-text-primary">Scrollback Lines</span>
            <span className="text-xs text-text-muted">Number of lines to keep in terminal history</span>
            <select
              value={scrollback}
              onChange={(e) => void updateTerminal({ scrollback: Number(e.target.value) })}
              className={inputClasses}
            >
              {SCROLLBACK_OPTIONS.map((n) => (
                <option key={n} value={n}>{n.toLocaleString()}</option>
              ))}
            </select>
          </label>

          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-text-primary">Auth Trace Logging</div>
                <div className="text-xs text-text-muted">
                  Log whether saved credentials were resolved and used (never logs secrets)
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={authTracing}
                onClick={() => void updateDebug({ authTracing: !authTracing })}
                className={[
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent/40 focus:ring-offset-2 focus:ring-offset-base-900",
                  authTracing ? "bg-accent" : "bg-base-600",
                ].join(" ")}
              >
                <span
                  className={[
                    "pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-in-out",
                    authTracing ? "translate-x-4" : "translate-x-0.5",
                  ].join(" ")}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);
  const customThemes = useStore(settingsStore, (s) => s.settings.customThemes ?? {});
  const deleteCustomTheme = useStore(settingsStore, (s) => s.deleteCustomTheme);
  const [showEditor, setShowEditor] = useState(false);
  const { theme } = settings.terminal;

  const allThemes = [
    ...Object.entries(terminalThemes).map(([key, obj]) => ({ key, obj, isCustom: false })),
    ...Object.entries(customThemes).map(([key, obj]) => ({ key, obj, isCustom: true })),
  ];

  return (
    <div className="grid gap-6">
      {/* Theme picker */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Theme</h3>
        <div className="grid grid-cols-2 gap-2">
          {allThemes.map(({ key, obj: themeObj, isCustom }) => {
            const isActive = theme === key;
            return (
              <div key={key} className="relative group">
                <button
                  type="button"
                  onClick={() => void updateTerminal({ theme: key })}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition-all duration-150",
                    isActive
                      ? "border-accent/40 bg-accent/10 ring-1 ring-accent/20"
                      : "border-border bg-surface/60 hover:border-border-bright hover:bg-surface/80",
                  ].join(" ")}
                >
                  {/* Color preview bar */}
                  <div className="flex gap-0.5 mb-2">
                    {[themeObj.red, themeObj.green, themeObj.blue, themeObj.yellow, themeObj.magenta, themeObj.cyan].map(
                      (color, i) => (
                        <div
                          key={i}
                          className="h-2 flex-1 rounded-sm first:rounded-l last:rounded-r"
                          style={{ backgroundColor: color }}
                        />
                      )
                    )}
                  </div>
                  {/* Mini terminal preview */}
                  <div
                    className="rounded px-2 py-1.5 font-mono text-[10px] leading-tight mb-2"
                    style={{ background: themeObj.background, color: themeObj.foreground }}
                  >
                    <span style={{ color: themeObj.green }}>$</span>{" "}
                    <span style={{ color: themeObj.cyan }}>ls</span>{" "}
                    <span style={{ color: themeObj.blue }}>src/</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-text-secondary">
                      {formatThemeName(key)}
                    </span>
                    {isCustom && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-accent/10 text-accent font-medium">
                        Custom
                      </span>
                    )}
                  </div>
                </button>
                {isCustom && (
                  <button
                    onClick={() => void deleteCustomTheme(key)}
                    className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-base-900/80 text-text-muted hover:text-danger text-xs transition-colors"
                    title="Delete theme"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Theme editor */}
      {showEditor ? (
        <ThemeEditor onClose={() => setShowEditor(false)} />
      ) : (
        <button
          onClick={() => setShowEditor(true)}
          className="w-full rounded-lg border border-dashed border-border py-2.5 text-xs text-text-muted hover:text-text-secondary hover:border-border-bright transition-colors"
        >
          + Create Custom Theme
        </button>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("general");

  return (
    <div className="flex h-[520px]">
      {/* Category sidebar */}
      <nav className="w-44 shrink-0 border-r border-border pr-2 mr-4 flex flex-col gap-0.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={[
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 text-sm",
              activeCategory === cat.id
                ? "bg-accent/10 text-accent font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-base-700/50",
            ].join(" ")}
          >
            <span className={activeCategory === cat.id ? "text-accent" : "text-text-muted"}>
              {cat.icon}
            </span>
            {cat.label}
          </button>
        ))}
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        {activeCategory === "general" && <GeneralSection />}
        {activeCategory === "terminal" && <TerminalSection />}
        {activeCategory === "appearance" && <AppearanceSection />}
        {activeCategory === "ssh-keys" && <SshKeyManager />}
        {activeCategory === "backup" && <BackupRestorePanel />}
      </div>
    </div>
  );
}
