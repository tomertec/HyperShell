import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock window.sshterm before importing store
const mockSshterm = {
  getSetting: vi.fn().mockResolvedValue(null),
  updateSetting: vi.fn().mockResolvedValue({ key: "app.settings", value: "{}" }),
};
vi.stubGlobal("window", { sshterm: mockSshterm });

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
  it("has empty customThemes by default", () => {
    const state = settingsStore.getState();
    expect(state.settings.customThemes).toEqual({});
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
});
