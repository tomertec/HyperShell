import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window.hypershell before importing store
const mockSshterm = {
  getSetting: vi.fn().mockResolvedValue(null),
  updateSetting: vi.fn().mockResolvedValue({ key: "app.settings", value: "{}" }),
};
vi.stubGlobal("window", { hypershell: mockSshterm });

import {
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  settingsStore,
  TERMINAL_FONT_SIZE_OPTIONS,
  type TerminalTheme,
} from "./settingsStore";

const sampleTheme: TerminalTheme = {
  background: "#000000",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#000000",
  selectionBackground: "rgba(255,255,255,0.3)",
  black: "#000000", red: "#ff0000", green: "#00ff00", yellow: "#ffff00",
  blue: "#0000ff", magenta: "#ff00ff", cyan: "#00ffff", white: "#ffffff",
  brightBlack: "#808080", brightRed: "#ff0000", brightGreen: "#00ff00",
  brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff",
  brightCyan: "#00ffff", brightWhite: "#ffffff",
};

describe("settingsStore custom themes", () => {
  beforeEach(() => {
    mockSshterm.getSetting.mockReset();
    mockSshterm.getSetting.mockResolvedValue(null);
    mockSshterm.updateSetting.mockReset();
    mockSshterm.updateSetting.mockResolvedValue({ key: "app.settings", value: "{}" });
    settingsStore.setState((state) => ({
      loaded: false,
      settings: {
        ...state.settings,
        debug: { authTracing: false },
        general: {
          ...state.settings.general,
          showRecordingButton: true,
          showRestoreBanner: true,
          showSerialInSidebar: true,
          confirmOnClose: true,
          usePopupTransferMonitor: false,
        },
        security: {
          credentialCacheEnabled: true,
          credentialCacheTtlMinutes: 15,
        },
        appearance: {
          appTheme: "system",
          tabTitleColors: {},
        },
        customThemes: {},
      },
    }));
  });

  it("has empty customThemes by default", () => {
    const state = settingsStore.getState();
    expect(state.settings.customThemes).toEqual({});
  });

  it("offers session recovery by default, and keeps that default for settings saved before it existed", async () => {
    expect(settingsStore.getState().settings.general.showSessionRecoveryPrompt).toBe(true);

    mockSshterm.getSetting.mockResolvedValue({
      key: "app.settings",
      value: JSON.stringify({ general: { showRestoreBanner: false } }),
    });
    await settingsStore.getState().load();

    const general = settingsStore.getState().settings.general;
    expect(general.showSessionRecoveryPrompt).toBe(true);
    expect(general.showRestoreBanner).toBe(false);
  });

  it("shows serial profiles in sidebar by default", () => {
    const state = settingsStore.getState();
    expect(state.settings.general.showSerialInSidebar).toBe(true);
  });

  it("saveCustomTheme adds a theme", async () => {
    await settingsStore.getState().saveCustomTheme("myTheme", sampleTheme);
    expect(settingsStore.getState().settings.customThemes["myTheme"]).toEqual(sampleTheme);
  });

  it("deleteCustomTheme removes a theme", async () => {
    // Ensure it exists first
    await settingsStore.getState().saveCustomTheme("myTheme", sampleTheme);
    expect(settingsStore.getState().settings.customThemes["myTheme"]).toBeDefined();

    await settingsStore.getState().deleteCustomTheme("myTheme");
    expect(settingsStore.getState().settings.customThemes["myTheme"]).toBeUndefined();
  });

  it("saveCustomTheme persists via updateSetting", async () => {
    mockSshterm.updateSetting.mockClear();
    await settingsStore.getState().saveCustomTheme("persisted", sampleTheme);
    expect(mockSshterm.updateSetting).toHaveBeenCalledTimes(1);
    const savedValue = JSON.parse(mockSshterm.updateSetting.mock.calls[0][0].value);
    expect(savedValue.customThemes["persisted"]).toEqual(sampleTheme);
  });

  it("updateGeneral persists serial sidebar visibility", async () => {
    await settingsStore.getState().updateGeneral({ showSerialInSidebar: false });
    expect(settingsStore.getState().settings.general.showSerialInSidebar).toBe(false);
    expect(mockSshterm.updateSetting).toHaveBeenCalledTimes(1);
    const savedValue = JSON.parse(mockSshterm.updateSetting.mock.calls[0][0].value);
    expect(savedValue.general.showSerialInSidebar).toBe(false);
  });

  it("popup transfer monitor defaults to disabled", () => {
    const state = settingsStore.getState();
    expect(state.settings.general.usePopupTransferMonitor).toBe(false);
  });

  it("updateGeneral persists popup transfer monitor state", async () => {
    await settingsStore.getState().updateGeneral({ usePopupTransferMonitor: true });
    expect(settingsStore.getState().settings.general.usePopupTransferMonitor).toBe(true);
    expect(mockSshterm.updateSetting).toHaveBeenCalledTimes(1);
    const savedValue = JSON.parse(mockSshterm.updateSetting.mock.calls[0][0].value);
    expect(savedValue.general.usePopupTransferMonitor).toBe(true);
  });

  it("credential cache settings default to enabled with 15 minute timeout", () => {
    const state = settingsStore.getState().settings.security;
    expect(state.credentialCacheEnabled).toBe(true);
    expect(state.credentialCacheTtlMinutes).toBe(15);
  });

  it("updateSecurity persists credential cache settings", async () => {
    await settingsStore.getState().updateSecurity({
      credentialCacheEnabled: false,
      credentialCacheTtlMinutes: 42,
    });

    const state = settingsStore.getState().settings.security;
    expect(state.credentialCacheEnabled).toBe(false);
    expect(state.credentialCacheTtlMinutes).toBe(42);

    expect(mockSshterm.updateSetting).toHaveBeenCalledTimes(1);
    const savedValue = JSON.parse(mockSshterm.updateSetting.mock.calls[0][0].value);
    expect(savedValue.security.credentialCacheEnabled).toBe(false);
    expect(savedValue.security.credentialCacheTtlMinutes).toBe(42);
  });
});

describe("settingsStore tab title colors", () => {
  beforeEach(() => {
    mockSshterm.getSetting.mockReset();
    mockSshterm.updateSetting.mockReset();
    mockSshterm.updateSetting.mockResolvedValue({ key: "app.settings", value: "{}" });
    settingsStore.setState((state) => ({
      loaded: false,
      settings: {
        ...state.settings,
        appearance: { appTheme: "system", tabTitleColors: {} },
      },
    }));
  });

  it("loads only valid normalized title-color rules", async () => {
    mockSshterm.getSetting.mockResolvedValue({
      key: "app.settings",
      value: JSON.stringify({
        appearance: {
          appTheme: "mocha",
          tabTitleColors: { " Claude ": "orange", broken: "chartreuse" },
        },
      }),
    });

    await settingsStore.getState().load();

    expect(settingsStore.getState().settings.appearance).toEqual({
      appTheme: "mocha",
      tabTitleColors: { claude: "orange" },
    });
  });

  it("persists and removes a normalized title rule", async () => {
    await settingsStore.getState().updateTabTitleColor(" Claude ", "orange");
    let saved = JSON.parse(mockSshterm.updateSetting.mock.calls.at(-1)![0].value);
    expect(saved.appearance.tabTitleColors).toEqual({ claude: "orange" });

    await settingsStore.getState().updateTabTitleColor("CLAUDE", null);
    saved = JSON.parse(mockSshterm.updateSetting.mock.calls.at(-1)![0].value);
    expect(saved.appearance.tabTitleColors).toEqual({});
  });
});

describe("settingsStore appearance migration", () => {
  beforeEach(() => {
    mockSshterm.getSetting.mockReset();
    mockSshterm.updateSetting.mockReset();
    mockSshterm.updateSetting.mockResolvedValue({ key: "app.settings", value: "{}" });
  });

  async function loadWith(appearance: unknown): Promise<string> {
    mockSshterm.getSetting.mockResolvedValue({
      key: "app.settings",
      value: JSON.stringify({ appearance }),
    });
    await settingsStore.getState().load();
    return settingsStore.getState().settings.appearance.appTheme;
  }

  it("migrates legacy themeMode 'light' to the light default theme", async () => {
    expect(await loadWith({ themeMode: "light" })).toBe("default-light");
  });

  it("migrates legacy themeMode 'dark' to the dark default theme", async () => {
    expect(await loadWith({ themeMode: "dark" })).toBe("default");
  });

  it("migrates legacy themeMode 'system' to system", async () => {
    expect(await loadWith({ themeMode: "system" })).toBe("system");
  });

  it("preserves an already-migrated appTheme id", async () => {
    expect(await loadWith({ appTheme: "mocha" })).toBe("mocha");
  });

  it("defaults to system when appearance is absent", async () => {
    mockSshterm.getSetting.mockResolvedValue({
      key: "app.settings",
      value: JSON.stringify({}),
    });
    await settingsStore.getState().load();
    expect(settingsStore.getState().settings.appearance.appTheme).toBe("system");
  });
});

describe("settingsStore terminal font size", () => {
  beforeEach(() => {
    mockSshterm.updateSetting.mockReset();
    mockSshterm.updateSetting.mockResolvedValue({ key: "app.settings", value: "{}" });
    settingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        terminal: { ...state.settings.terminal, fontSize: 13 },
      },
    }));
  });

  it("changes terminal font size in half-pixel increments", async () => {
    await settingsStore.getState().changeTerminalFontSize(0.5);
    expect(settingsStore.getState().settings.terminal.fontSize).toBe(13.5);

    await settingsStore.getState().changeTerminalFontSize(-0.5);
    expect(settingsStore.getState().settings.terminal.fontSize).toBe(13);
  });

  it("keeps half-pixel changes within the existing font-size bounds", async () => {
    await settingsStore.getState().setTerminalFontSize(MAX_TERMINAL_FONT_SIZE);
    await settingsStore.getState().changeTerminalFontSize(0.5);
    expect(settingsStore.getState().settings.terminal.fontSize).toBe(32);

    await settingsStore.getState().setTerminalFontSize(MIN_TERMINAL_FONT_SIZE);
    await settingsStore.getState().changeTerminalFontSize(-0.5);
    expect(settingsStore.getState().settings.terminal.fontSize).toBe(8);
  });

  it("normalizes terminal font sizes to the nearest half pixel", async () => {
    await settingsStore.getState().setTerminalFontSize(13.24);
    expect(settingsStore.getState().settings.terminal.fontSize).toBe(13);

    await settingsStore.getState().setTerminalFontSize(13.26);
    expect(settingsStore.getState().settings.terminal.fontSize).toBe(13.5);
  });

  it("offers every supported half-pixel font size to settings controls", () => {
    expect(TERMINAL_FONT_SIZE_OPTIONS).toHaveLength(49);
    expect(TERMINAL_FONT_SIZE_OPTIONS.slice(0, 3)).toEqual([8, 8.5, 9]);
    expect(TERMINAL_FONT_SIZE_OPTIONS[11]).toBe(13.5);
    expect(TERMINAL_FONT_SIZE_OPTIONS.slice(-3)).toEqual([31, 31.5, 32]);
  });
});
