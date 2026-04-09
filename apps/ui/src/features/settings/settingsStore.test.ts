import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window.hypershell before importing store
const mockSshterm = {
  getSetting: vi.fn().mockResolvedValue(null),
  updateSetting: vi.fn().mockResolvedValue({ key: "app.settings", value: "{}" }),
};
vi.stubGlobal("window", { hypershell: mockSshterm });

import { settingsStore, type TerminalTheme } from "./settingsStore";

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
        customThemes: {},
      },
    }));
  });

  it("has empty customThemes by default", () => {
    const state = settingsStore.getState();
    expect(state.settings.customThemes).toEqual({});
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
