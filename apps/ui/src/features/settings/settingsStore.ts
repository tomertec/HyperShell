import { createStore } from "zustand/vanilla";
import type { TerminalTheme } from "../terminal/terminalTheme";

export type { TerminalTheme };

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  cursorBlink: boolean;
  scrollback: number;
  theme: string;
}

export interface DebugSettings {
  authTracing: boolean;
}

export interface GeneralSettings {
  showRecordingButton: boolean;
  showRestoreBanner: boolean;
  showSerialInSidebar: boolean;
  confirmOnClose: boolean;
  usePopupTransferMonitor: boolean;
  enableTelnet: boolean;
}

export interface SecuritySettings {
  credentialCacheEnabled: boolean;
  credentialCacheTtlMinutes: number;
}

export interface AppSettings {
  terminal: TerminalSettings;
  debug: DebugSettings;
  general: GeneralSettings;
  security: SecuritySettings;
  customThemes: Record<string, TerminalTheme>;
}

export const MIN_TERMINAL_FONT_SIZE = 8;
export const MAX_TERMINAL_FONT_SIZE = 32;
export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_LINE_HEIGHT = 1.0;
export const MAX_TERMINAL_LINE_HEIGHT = 2.0;
export const MIN_TERMINAL_LETTER_SPACING = -2;
export const MAX_TERMINAL_LETTER_SPACING = 4;
export const DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES = 15;
export const MIN_CREDENTIAL_CACHE_TTL_MINUTES = 1;
export const MAX_CREDENTIAL_CACHE_TTL_MINUTES = 24 * 60;

function clampTerminalFontSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TERMINAL_FONT_SIZE;
  }
  return Math.min(
    MAX_TERMINAL_FONT_SIZE,
    Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(parsed))
  );
}

function clampTerminalLineHeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return MIN_TERMINAL_LINE_HEIGHT;
  }
  return Math.min(
    MAX_TERMINAL_LINE_HEIGHT,
    Math.max(MIN_TERMINAL_LINE_HEIGHT, Math.round(parsed * 100) / 100)
  );
}

function clampTerminalLetterSpacing(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(
    MAX_TERMINAL_LETTER_SPACING,
    Math.max(MIN_TERMINAL_LETTER_SPACING, Math.round(parsed))
  );
}

function clampCredentialCacheTtlMinutes(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES;
  }
  return Math.min(
    MAX_CREDENTIAL_CACHE_TTL_MINUTES,
    Math.max(MIN_CREDENTIAL_CACHE_TTL_MINUTES, Math.round(parsed))
  );
}

const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily:
    '"Cascadia Mono", "Cascadia Code", Consolas, "IBM Plex Mono", "Liberation Mono", monospace',
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  lineHeight: 1.0,
  letterSpacing: 0,
  cursorBlink: true,
  scrollback: 5000,
  theme: "default"
};

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  showRecordingButton: true,
  showRestoreBanner: true,
  showSerialInSidebar: true,
  confirmOnClose: true,
  usePopupTransferMonitor: false,
  enableTelnet: false,
};

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  credentialCacheEnabled: true,
  credentialCacheTtlMinutes: DEFAULT_CREDENTIAL_CACHE_TTL_MINUTES,
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  terminal: DEFAULT_TERMINAL_SETTINGS,
  debug: {
    authTracing: false
  },
  general: DEFAULT_GENERAL_SETTINGS,
  security: DEFAULT_SECURITY_SETTINGS,
  customThemes: {}
};

const SETTINGS_KEY = "app.settings";

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  updateTerminal: (partial: Partial<TerminalSettings>) => Promise<void>;
  updateDebug: (partial: Partial<DebugSettings>) => Promise<void>;
  updateGeneral: (partial: Partial<GeneralSettings>) => Promise<void>;
  updateSecurity: (partial: Partial<SecuritySettings>) => Promise<void>;
  setTerminalFontSize: (fontSize: number) => Promise<void>;
  changeTerminalFontSize: (delta: number) => Promise<number>;
  resetTerminalFontSize: () => Promise<void>;
  saveCustomTheme: (name: string, theme: TerminalTheme) => Promise<void>;
  deleteCustomTheme: (name: string) => Promise<void>;
}

async function persistSettings(settings: AppSettings): Promise<void> {
  const updateSetting = window.hypershell?.updateSetting;
  if (updateSetting) {
    await updateSetting({ key: SETTINGS_KEY, value: JSON.stringify(settings) });
  }
}

export const settingsStore = createStore<SettingsState>()((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const getSetting = window.hypershell?.getSetting;
      const result = getSetting ? await getSetting({ key: SETTINGS_KEY }) : null;
      if (result?.value) {
        try {
          const parsed = JSON.parse(result.value) as Partial<AppSettings>;
          const merged: AppSettings = {
            terminal: {
              ...DEFAULT_TERMINAL_SETTINGS,
              ...(parsed.terminal ?? {})
            },
            debug: {
              ...DEFAULT_APP_SETTINGS.debug,
              ...(parsed.debug ?? {})
            },
            general: {
              ...DEFAULT_GENERAL_SETTINGS,
              ...(parsed.general ?? {})
            },
            security: {
              ...DEFAULT_SECURITY_SETTINGS,
              ...(parsed.security ?? {})
            },
            customThemes: parsed.customThemes ?? {}
          };
          merged.terminal.fontSize = clampTerminalFontSize(merged.terminal.fontSize);
          merged.terminal.lineHeight = clampTerminalLineHeight(merged.terminal.lineHeight);
          merged.terminal.letterSpacing = clampTerminalLetterSpacing(
            merged.terminal.letterSpacing
          );
          merged.security.credentialCacheTtlMinutes = clampCredentialCacheTtlMinutes(
            merged.security.credentialCacheTtlMinutes
          );
          set({ settings: merged, loaded: true });
          return;
        } catch {
          // JSON parse failed — fall through to defaults
        }
      }
    } catch {
      // IPC call failed — fall through to defaults
    }
    set({ loaded: true });
  },

  updateTerminal: async (partial) => {
    const current = get().settings;
    const nextTerminal = { ...current.terminal, ...partial };
    nextTerminal.fontSize = clampTerminalFontSize(nextTerminal.fontSize);
    nextTerminal.lineHeight = clampTerminalLineHeight(nextTerminal.lineHeight);
    nextTerminal.letterSpacing = clampTerminalLetterSpacing(nextTerminal.letterSpacing);
    const next: AppSettings = {
      ...current,
      terminal: nextTerminal
    };
    set({ settings: next });
    try {
      await persistSettings(next);
    } catch {
      // persist failure is non-fatal; in-memory state is already updated
    }
  },

  updateDebug: async (partial) => {
    const current = get().settings;
    const next: AppSettings = {
      ...current,
      debug: {
        ...current.debug,
        ...partial
      }
    };
    set({ settings: next });
    try {
      await persistSettings(next);
    } catch {
      // persist failure is non-fatal; in-memory state is already updated
    }
  },

  updateGeneral: async (partial) => {
    const current = get().settings;
    const next: AppSettings = {
      ...current,
      general: {
        ...current.general,
        ...partial
      }
    };
    set({ settings: next });
    try {
      await persistSettings(next);
    } catch (error) {
      console.warn("[settings] Failed to persist settings", error);
    }
  },

  updateSecurity: async (partial) => {
    const current = get().settings;
    const nextSecurity: SecuritySettings = {
      ...current.security,
      ...partial
    };
    nextSecurity.credentialCacheTtlMinutes = clampCredentialCacheTtlMinutes(
      nextSecurity.credentialCacheTtlMinutes
    );
    const next: AppSettings = {
      ...current,
      security: nextSecurity
    };
    set({ settings: next });
    try {
      await persistSettings(next);
    } catch (error) {
      console.warn("[settings] Failed to persist settings", error);
    }
  },

  setTerminalFontSize: async (fontSize) => {
    await get().updateTerminal({ fontSize });
  },

  changeTerminalFontSize: async (delta) => {
    const currentFontSize = clampTerminalFontSize(get().settings.terminal.fontSize);
    const nextFontSize = clampTerminalFontSize(currentFontSize + delta);
    if (nextFontSize !== currentFontSize) {
      await get().updateTerminal({ fontSize: nextFontSize });
    }
    return nextFontSize;
  },

  resetTerminalFontSize: async () => {
    await get().updateTerminal({ fontSize: DEFAULT_TERMINAL_FONT_SIZE });
  },

  saveCustomTheme: async (name, theme) => {
    const current = get().settings;
    const next: AppSettings = {
      ...current,
      customThemes: { ...current.customThemes, [name]: theme },
    };
    set({ settings: next });
    try {
      await persistSettings(next);
    } catch (error) {
      console.warn("[settings] Failed to persist settings", error);
    }
  },

  deleteCustomTheme: async (name) => {
    const current = get().settings;
    const { [name]: _, ...rest } = current.customThemes ?? {};
    const next: AppSettings = { ...current, customThemes: rest };
    set({ settings: next });
    try {
      await persistSettings(next);
    } catch (error) {
      console.warn("[settings] Failed to persist settings", error);
    }
  }
}));
