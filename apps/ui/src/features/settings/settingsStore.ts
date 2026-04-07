import { createStore } from "zustand/vanilla";

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorBlink: boolean;
  scrollback: number;
  theme: string;
}

export interface AppSettings {
  terminal: TerminalSettings;
}

const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontFamily: '"IBM Plex Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  cursorBlink: true,
  scrollback: 5000,
  theme: "default"
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  terminal: DEFAULT_TERMINAL_SETTINGS
};

const SETTINGS_KEY = "app.settings";

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  updateTerminal: (partial: Partial<TerminalSettings>) => Promise<void>;
}

export const settingsStore = createStore<SettingsState>()((set, get) => ({
  settings: DEFAULT_APP_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const result = await window.sshterm?.getSetting({ key: SETTINGS_KEY });
      if (result?.value) {
        try {
          const parsed = JSON.parse(result.value) as Partial<AppSettings>;
          const merged: AppSettings = {
            terminal: {
              ...DEFAULT_TERMINAL_SETTINGS,
              ...(parsed.terminal ?? {})
            }
          };
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
    const next: AppSettings = {
      ...current,
      terminal: { ...current.terminal, ...partial }
    };
    set({ settings: next });
    try {
      await window.sshterm?.updateSetting({
        key: SETTINGS_KEY,
        value: JSON.stringify(next)
      });
    } catch {
      // persist failure is non-fatal; in-memory state is already updated
    }
  }
}));
