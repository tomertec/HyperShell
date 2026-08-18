import { useId, useState, useEffect } from "react";
import { useStore } from "zustand";
import {
  MAX_CREDENTIAL_CACHE_TTL_MINUTES,
  MAX_TERMINAL_LETTER_SPACING,
  MAX_TERMINAL_LINE_HEIGHT,
  MIN_CREDENTIAL_CACHE_TTL_MINUTES,
  MIN_TERMINAL_LETTER_SPACING,
  MIN_TERMINAL_LINE_HEIGHT,
  TERMINAL_FONT_SIZE_OPTIONS,
  settingsStore
} from "./settingsStore";
import { APP_THEMES } from "./appThemes";
import { terminalThemes } from "../terminal/terminalTheme";
import { ThemeEditor } from "./ThemeEditor";
import { SshKeyManager } from "../ssh-keys/SshKeyManager";
import { BackupRestorePanel } from "./BackupRestorePanel";
import { useUpdateStore } from "../updates/updateStore";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { SectionLabel } from "../../components/ui/SectionLabel";

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

const SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10000, 25000, 50000];

function formatThemeName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

type SettingsCategory = "general" | "security" | "terminal" | "appearance" | "ssh-keys" | "backup" | "import" | "updates";

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
    id: "security",
    label: "Security",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.5 13 3.5v3.6c0 3.2-2.2 5.9-5 7.4-2.8-1.5-5-4.2-5-7.4V3.5l5-2Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 6.4v2.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="0.7" fill="currentColor" />
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
  {
    id: "import",
    label: "Import",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "updates",
    label: "Updates",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3v5l3 2M8 1a7 7 0 1 0 7 7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

/**
 * `label` is required: a bare role="switch" with no accessible name is
 * announced as an unnamed control. Pass the same text as the visible row title
 * so the accessible name matches what is on screen.
 */
function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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

/**
 * The one setting-row anatomy: title (plus optional one-line description) on
 * the left, control right-aligned. Pass `controlId` when the control is a real
 * form field so the title becomes its `<label>`; toggles carry their own
 * aria-label instead.
 */
function SettingRow({
  label,
  description,
  controlId,
  children
}: {
  label: string;
  description?: React.ReactNode;
  controlId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        {controlId ? (
          <label htmlFor={controlId} className="block text-sm text-text-primary">
            {label}
          </label>
        ) : (
          <div className="text-sm text-text-primary">{label}</div>
        )}
        {description ? <div className="text-xs text-text-muted">{description}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Keeps right-aligned fields off the full-width default the field recipe uses. */
function ControlSlot({ children }: { children: React.ReactNode }) {
  return <div className="w-40 shrink-0">{children}</div>;
}

function GeneralSection() {
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateGeneral = useStore(settingsStore, (s) => s.updateGeneral);
  const {
    showRecordingButton,
    showRestoreBanner,
    showSessionRecoveryPrompt,
    showSerialInSidebar,
    showLocalInSidebar,
    confirmOnClose,
    usePopupTransferMonitor,
    autoHideCompletedTransfers,
    enableTelnet,
    showActiveProcess
  } = settings.general;

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">Session</SectionLabel>

      <SettingRow
        label="Session Recording Button"
        description="Show the recording button in terminal panes"
      >
        <ToggleSwitch
          label="Session Recording Button"
          checked={showRecordingButton}
          onChange={() => void updateGeneral({ showRecordingButton: !showRecordingButton })}
        />
      </SettingRow>

      <SettingRow
        label="Session Restore Prompt"
        description={'Show "Restore sessions from last session" on startup'}
      >
        <ToggleSwitch
          label="Session Restore Prompt"
          checked={showRestoreBanner}
          onChange={() => void updateGeneral({ showRestoreBanner: !showRestoreBanner })}
        />
      </SettingRow>

      <SettingRow
        label="Session Recovery Prompt"
        description="Offer to reopen sessions left behind by an ungraceful shutdown"
      >
        <ToggleSwitch
          label="Session Recovery Prompt"
          checked={showSessionRecoveryPrompt}
          onChange={() =>
            void updateGeneral({ showSessionRecoveryPrompt: !showSessionRecoveryPrompt })
          }
        />
      </SettingRow>

      <SettingRow
        label="Serial Section in Sidebar"
        description="Show serial profiles in the hosts sidebar list"
      >
        <ToggleSwitch
          label="Serial Section in Sidebar"
          checked={showSerialInSidebar}
          onChange={() => void updateGeneral({ showSerialInSidebar: !showSerialInSidebar })}
        />
      </SettingRow>

      <SettingRow
        label="Local Section in Sidebar"
        description="Show local shell profiles in the hosts sidebar list"
      >
        <ToggleSwitch
          label="Local Section in Sidebar"
          checked={showLocalInSidebar}
          onChange={() => void updateGeneral({ showLocalInSidebar: !showLocalInSidebar })}
        />
      </SettingRow>

      <SettingRow
        label="Show Running Program in Tab Titles"
        description="Show the foreground program's name in tab titles, tooltips, and the status bar"
      >
        <ToggleSwitch
          label="Show Running Program in Tab Titles"
          checked={showActiveProcess}
          onChange={() => void updateGeneral({ showActiveProcess: !showActiveProcess })}
        />
      </SettingRow>

      <SettingRow
        label="Confirm on Close"
        description="Ask for confirmation before closing with active sessions"
      >
        <ToggleSwitch
          label="Confirm on Close"
          checked={confirmOnClose}
          onChange={() => void updateGeneral({ confirmOnClose: !confirmOnClose })}
        />
      </SettingRow>

      <SectionLabel className="pt-4 pb-1">Transfers</SectionLabel>

      <SettingRow
        label="Popup SFTP Transfer Monitor"
        description="Replace the inline transfer strip with a floating popup that shows animated progress and live speed"
      >
        <ToggleSwitch
          label="Popup SFTP Transfer Monitor"
          checked={usePopupTransferMonitor}
          onChange={() =>
            void updateGeneral({ usePopupTransferMonitor: !usePopupTransferMonitor })
          }
        />
      </SettingRow>

      <SettingRow
        label="Auto-Hide Completed Transfers"
        description="Automatically hide the transfer popup when all transfers finish"
      >
        <ToggleSwitch
          label="Auto-Hide Completed Transfers"
          checked={autoHideCompletedTransfers}
          onChange={() =>
            void updateGeneral({ autoHideCompletedTransfers: !autoHideCompletedTransfers })
          }
        />
      </SettingRow>

      <SectionLabel className="pt-4 pb-1">Protocols</SectionLabel>

      <SettingRow
        label="Enable Telnet / Raw TCP"
        description="Show Telnet quick-connect option for network gear and raw TCP services"
      >
        <ToggleSwitch
          label="Enable Telnet / Raw TCP"
          checked={enableTelnet}
          onChange={() => void updateGeneral({ enableTelnet: !enableTelnet })}
        />
      </SettingRow>
    </div>
  );
}

function UpdatesSection() {
  const update = useUpdateStore((s) => s.update);
  const check = useUpdateStore((s) => s.check);
  const refresh = useUpdateStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentVersion = update?.currentVersion ?? "—";
  const checking = update?.status === "checking";

  function statusLine(): string {
    if (!update) {
      return "";
    }
    switch (update.status) {
      case "checking":
        return "Checking for updates…";
      case "available":
      case "manual-available":
        return `Update available: v${update.availableVersion}`;
      case "downloading":
        return `Downloading: ${update.progressPercent ?? 0}%`;
      case "downloaded":
        return `Update v${update.availableVersion} ready to install`;
      case "up-to-date":
        return "You're on the latest version.";
      case "error":
        return `Couldn't check — ${update.error ?? "try again"}`;
      default:
        return "";
    }
  }

  const status = statusLine();

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">Application Updates</SectionLabel>

      <SettingRow
        label="Current version"
        description={update ? `v${currentVersion}` : currentVersion}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void check()}
          disabled={checking}
          className="shrink-0"
        >
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      </SettingRow>

      {status ? <div className="text-xs text-text-muted">{status}</div> : null}
      {update?.lastCheckedAt ? (
        <div className="text-xs text-text-muted">
          Last checked: {new Date(update.lastCheckedAt).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

function SecuritySection() {
  const fieldId = useId();
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateSecurity = useStore(settingsStore, (s) => s.updateSecurity);
  const { credentialCacheEnabled, credentialCacheTtlMinutes } = settings.security;

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">Authentication</SectionLabel>

      <SettingRow
        label="Credential Cache"
        description="Cache SSH passwords in main-process memory for reconnects (never written to disk)"
      >
        <ToggleSwitch
          label="Credential Cache"
          checked={credentialCacheEnabled}
          onChange={() =>
            void updateSecurity({ credentialCacheEnabled: !credentialCacheEnabled })
          }
        />
      </SettingRow>

      <SettingRow
        label="Cache Timeout (minutes)"
        description="Cached credentials expire after this inactivity window"
        controlId={`${fieldId}-cacheTtl`}
      >
        <ControlSlot>
          <Input
            id={`${fieldId}-cacheTtl`}
            type="number"
            min={MIN_CREDENTIAL_CACHE_TTL_MINUTES}
            max={MAX_CREDENTIAL_CACHE_TTL_MINUTES}
            step={1}
            disabled={!credentialCacheEnabled}
            value={credentialCacheTtlMinutes}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10);
              if (!Number.isFinite(parsed)) {
                return;
              }
              void updateSecurity({ credentialCacheTtlMinutes: parsed });
            }}
          />
        </ControlSlot>
      </SettingRow>
    </div>
  );
}

function TerminalSection() {
  const fieldId = useId();
  const settings = useStore(settingsStore, (s) => s.settings);
  const updateTerminal = useStore(settingsStore, (s) => s.updateTerminal);
  const updateDebug = useStore(settingsStore, (s) => s.updateDebug);
  const { fontFamily, fontSize, lineHeight, letterSpacing, cursorBlink, scrollback } =
    settings.terminal;
  const authTracing = settings.debug.authTracing;

  const activeFontValue =
    FONT_OPTIONS.find((f) => fontFamily.includes(f.label))?.value ?? FONT_OPTIONS[0].value;

  return (
    <div>
      <SectionLabel className="pt-4 pb-1">Font</SectionLabel>

      <SettingRow label="Family" controlId={`${fieldId}-fontFamily`}>
        <ControlSlot>
          <Select
            id={`${fieldId}-fontFamily`}
            value={activeFontValue}
            onChange={(e) => void updateTerminal({ fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.label} value={f.value}>{f.label}</option>
            ))}
          </Select>
        </ControlSlot>
      </SettingRow>

      <SettingRow label="Size" controlId={`${fieldId}-fontSize`}>
        <ControlSlot>
          <Select
            id={`${fieldId}-fontSize`}
            value={fontSize}
            onChange={(e) => void updateTerminal({ fontSize: Number(e.target.value) })}
          >
            {TERMINAL_FONT_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </Select>
        </ControlSlot>
      </SettingRow>

      <SettingRow label="Line Height" controlId={`${fieldId}-lineHeight`}>
        <ControlSlot>
          <Input
            id={`${fieldId}-lineHeight`}
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
          />
        </ControlSlot>
      </SettingRow>

      <SettingRow label="Character Spacing" controlId={`${fieldId}-letterSpacing`}>
        <ControlSlot>
          <Input
            id={`${fieldId}-letterSpacing`}
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
          />
        </ControlSlot>
      </SettingRow>

      <SectionLabel className="pt-4 pb-1">Behavior</SectionLabel>

      <SettingRow label="Cursor Blink" description="Animate the cursor in the terminal">
        <ToggleSwitch
          label="Cursor Blink"
          checked={cursorBlink}
          onChange={() => void updateTerminal({ cursorBlink: !cursorBlink })}
        />
      </SettingRow>

      <SettingRow
        label="Scrollback Lines"
        description="Number of lines to keep in terminal history"
        controlId={`${fieldId}-scrollback`}
      >
        <ControlSlot>
          <Select
            id={`${fieldId}-scrollback`}
            value={scrollback}
            onChange={(e) => void updateTerminal({ scrollback: Number(e.target.value) })}
          >
            {SCROLLBACK_OPTIONS.map((n) => (
              <option key={n} value={n}>{n.toLocaleString()}</option>
            ))}
          </Select>
        </ControlSlot>
      </SettingRow>

      <SettingRow
        label="Auth Trace Logging"
        description="Log whether saved credentials were resolved and used (never logs secrets)"
      >
        <ToggleSwitch
          label="Auth Trace Logging"
          checked={authTracing}
          onChange={() => void updateDebug({ authTracing: !authTracing })}
        />
      </SettingRow>
    </div>
  );
}

function AppThemeOption({
  id,
  label,
  swatch,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  swatch: string;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={[
        "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring",
        active
          ? "border-accent/60 bg-accent/10 text-text-primary"
          : "border-border bg-base-900 text-text-secondary hover:border-border-bright hover:text-text-primary",
      ].join(" ")}
    >
      <span
        className="h-4 w-4 shrink-0 rounded-full border border-border-bright"
        style={{ background: swatch }}
      />
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function AppearanceSection() {
  const appTheme = useStore(settingsStore, (s) => s.settings.appearance.appTheme);
  const updateAppearance = useStore(settingsStore, (s) => s.updateAppearance);

  const select = (id: string) => void updateAppearance({ appTheme: id });
  const followSystem = appTheme === "system";
  const darkThemes = APP_THEMES.filter((t) => t.variant === "dark");
  const lightThemes = APP_THEMES.filter((t) => t.variant === "light");

  return (
    <div className="grid gap-6">
      <div>
        <SectionLabel className="pt-4 pb-1">App Theme</SectionLabel>

        <button
          type="button"
          onClick={() => select("system")}
          className={[
            "mt-1 mb-2 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring",
            followSystem
              ? "border-accent/60 bg-accent/10 text-text-primary"
              : "border-border bg-base-900 text-text-secondary hover:border-border-bright hover:text-text-primary",
          ].join(" ")}
        >
          <span
            className={[
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              followSystem ? "border-accent bg-accent" : "border-border-bright",
            ].join(" ")}
          >
            {followSystem && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </span>
          <span className="text-xs font-medium">Follow system (auto light/dark)</span>
        </button>

        <SectionLabel className="pt-4 pb-1">Dark</SectionLabel>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {darkThemes.map((t) => (
            <AppThemeOption
              key={t.id}
              id={t.id}
              label={t.label}
              swatch={t.swatch}
              active={!followSystem && appTheme === t.id}
              onSelect={select}
            />
          ))}
        </div>

        <SectionLabel className="pt-4 pb-1">Light</SectionLabel>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {lightThemes.map((t) => (
            <AppThemeOption
              key={t.id}
              id={t.id}
              label={t.label}
              swatch={t.swatch}
              active={!followSystem && appTheme === t.id}
              onSelect={select}
            />
          ))}
        </div>
      </div>

      <TerminalThemeSection />
    </div>
  );
}

function TerminalThemeSection() {
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
        <SectionLabel className="pt-4 pb-1">Theme</SectionLabel>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {allThemes.map(({ key, obj: themeObj, isCustom }) => {
            const isActive = theme === key;
            return (
              <div key={key} className="relative group">
                <button
                  type="button"
                  onClick={() => void updateTerminal({ theme: key })}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring",
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
                    type="button"
                    onClick={() => void deleteCustomTheme(key)}
                    className="absolute top-1.5 right-1.5 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-base-900/80 text-text-muted hover:text-danger text-xs transition-colors duration-(--motion-fast) ease-standard focus-ring"
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
          type="button"
          onClick={() => setShowEditor(true)}
          className="w-full rounded-lg border border-dashed border-border py-2.5 text-xs text-text-muted hover:text-text-secondary hover:border-border-bright transition-colors duration-(--motion-fast) ease-standard focus-ring"
        >
          + Create Custom Theme
        </button>
      )}
    </div>
  );
}

const importButtonClasses =
  "flex items-center gap-3 w-full rounded-lg border border-border bg-surface/60 px-4 py-3 text-left transition-colors duration-(--motion-fast) ease-standard focus-ring hover:border-border-bright hover:bg-surface/80";

function ImportSection({ onImportSshConfig, onImportPutty, onImportSshManager }: {
  onImportSshConfig: () => void;
  onImportPutty: () => void;
  onImportSshManager: () => void;
}) {
  return (
    <div>
      <SectionLabel className="pt-4 pb-1">Import Hosts</SectionLabel>
      <div className="grid gap-3 pt-1">
        <button type="button" onClick={onImportSshConfig} className={importButtonClasses}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <div className="text-sm text-text-primary">Import SSH Config</div>
            <div className="text-xs text-text-muted">Import hosts from ~/.ssh/config</div>
          </div>
        </button>

        <button type="button" onClick={onImportPutty} className={importButtonClasses}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <rect x="3" y="1" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <div>
            <div className="text-sm text-text-primary">Import from PuTTY</div>
            <div className="text-xs text-text-muted">Import saved sessions from PuTTY registry</div>
          </div>
        </button>

        <button type="button" onClick={onImportSshManager} className={importButtonClasses}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M2 6h12" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="4.5" cy="9.5" r="1" fill="currentColor" />
          </svg>
          <div>
            <div className="text-sm text-text-primary">Import from SshManager</div>
            <div className="text-xs text-text-muted">Import hosts, groups, and snippets from SshManager database</div>
          </div>
        </button>
      </div>
    </div>
  );
}

export interface SettingsPanelProps {
  onImportSshConfig: () => void;
  onImportPutty: () => void;
  onImportSshManager: () => void;
}

export function SettingsPanel({ onImportSshConfig, onImportPutty, onImportSshManager }: SettingsPanelProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("general");

  return (
    <div className="flex h-[520px]">
      {/* Category sidebar */}
      <nav className="w-44 shrink-0 border-r border-border pr-2 mr-4 flex flex-col gap-0.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={[
              "flex items-center gap-2.5 rounded-lg border-l-2 px-3 py-2 text-left text-sm transition-colors duration-(--motion-fast) ease-standard focus-ring",
              activeCategory === cat.id
                ? "border-accent bg-accent/10 text-accent font-medium"
                : "border-transparent text-text-secondary hover:text-text-primary hover:bg-base-700/60",
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
        {activeCategory === "security" && <SecuritySection />}
        {activeCategory === "terminal" && <TerminalSection />}
        {activeCategory === "appearance" && <AppearanceSection />}
        {activeCategory === "ssh-keys" && <SshKeyManager />}
        {activeCategory === "backup" && <BackupRestorePanel />}
        {activeCategory === "import" && <ImportSection onImportSshConfig={onImportSshConfig} onImportPutty={onImportPutty} onImportSshManager={onImportSshManager} />}
        {activeCategory === "updates" && <UpdatesSection />}
      </div>
    </div>
  );
}
