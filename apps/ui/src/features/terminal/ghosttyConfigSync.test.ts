import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { setShell } from "../../lib/shell";
import { createFakeShell } from "../../lib/fakeShell";
import {
  buildGhosttyConfigRequest,
  pickSelectionForeground,
  resolveGhosttyTheme,
  syncGhosttySettingsToMain,
  toOpaqueHex
} from "./ghosttyConfigSync";
import { terminalThemes, type TerminalTheme } from "./terminalTheme";
import type { AppSettings, settingsStore } from "../settings/settingsStore";

const HEX = /^#[0-9a-f]{6}$/;

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    terminal: {
      fontFamily: '"Cascadia Mono", monospace',
      fontSize: 13,
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: true,
      scrollback: 5000,
      theme: "default"
    },
    debug: { authTracing: false },
    general: {
      showRecordingButton: true,
      showRestoreBanner: true,
      showSessionRecoveryPrompt: true,
      showSerialInSidebar: true,
      showLocalInSidebar: true,
      confirmOnClose: true,
      usePopupTransferMonitor: false,
      autoHideCompletedTransfers: false,
      enableTelnet: false,
      showActiveProcess: true
    },
    security: { credentialCacheEnabled: true, credentialCacheTtlMinutes: 15 },
    appearance: { appTheme: "system", tabTitleColors: {} },
    customThemes: {},
    ...overrides
  };
}

describe("toOpaqueHex", () => {
  it("composites a translucent color over the background the way xterm.js paints it", () => {
    // rgba(125, 211, 252, 0.28) over #07111f
    expect(toOpaqueHex("rgba(125, 211, 252, 0.28)", "#07111f", "#000000")).toBe("#28475d");
  });

  it("passes an opaque color through and expands the short form", () => {
    expect(toOpaqueHex("#ABCDEF", "#000000", "#000000")).toBe("#abcdef");
    expect(toOpaqueHex("#f00", "#000000", "#000000")).toBe("#ff0000");
  });

  it("falls back rather than emitting something the config parser would reject", () => {
    expect(toOpaqueHex("rebeccapurple", "#000000", "#123456")).toBe("#123456");
  });
});

describe("pickSelectionForeground", () => {
  it("keeps the theme foreground when it stays readable on the selection", () => {
    expect(pickSelectionForeground("#28475d", "#e5eefb", "#07111f")).toBe("#e5eefb");
  });

  it("switches to the background color when the foreground would disappear", () => {
    expect(pickSelectionForeground("#f0f0f0", "#eeeeee", "#111111")).toBe("#111111");
  });
});

describe("resolveGhosttyTheme", () => {
  it("produces #rrggbb for every field of every built-in theme", () => {
    for (const [name, theme] of Object.entries(terminalThemes)) {
      const resolved = resolveGhosttyTheme(theme);
      for (const [field, value] of Object.entries(resolved)) {
        if (field === "palette") continue;
        expect(value, `${name}.${field}`).toMatch(HEX);
      }
      expect(resolved.palette).toHaveLength(16);
      for (const entry of resolved.palette) {
        expect(entry, name).toMatch(HEX);
      }
    }
  });

  it("orders the palette black-first through bright-white", () => {
    const resolved = resolveGhosttyTheme(terminalThemes["dracula"]);
    expect(resolved.palette[0]).toBe(terminalThemes["dracula"].black);
    expect(resolved.palette[15]).toBe(terminalThemes["dracula"].brightWhite);
  });
});

describe("buildGhosttyConfigRequest", () => {
  it("carries the terminal settings and the resolved active theme", () => {
    const request = buildGhosttyConfigRequest(makeSettings());

    expect(request.fontFamily).toBe('"Cascadia Mono", monospace');
    expect(request.fontSize).toBe(13);
    expect(request.scrollback).toBe(5000);
    expect(request.cursorBlink).toBe(true);
    expect(request.theme.background).toBe(terminalThemes["default"].background);
  });

  it("resolves a custom theme by name", () => {
    const custom: TerminalTheme = { ...terminalThemes["nord"], background: "#123456" };
    const request = buildGhosttyConfigRequest(
      makeSettings({
        terminal: { ...makeSettings().terminal, theme: "mine" },
        customThemes: { mine: custom }
      })
    );

    expect(request.theme.background).toBe("#123456");
  });
});

describe("syncGhosttySettingsToMain", () => {
  function makeStore(settings: AppSettings) {
    return createStore(() => ({ settings, loaded: true })) as unknown as typeof settingsStore;
  }

  it("pushes immediately on subscribe, before any surface exists", () => {
    const ghosttyUpdateConfig = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ ghosttyUpdateConfig }).shell);
    try {
      syncGhosttySettingsToMain(makeStore(makeSettings()));
      expect(ghosttyUpdateConfig).toHaveBeenCalledTimes(1);
      expect(ghosttyUpdateConfig.mock.calls[0][0].fontSize).toBe(13);
    } finally {
      setShell(null);
    }
  });

  it("pushes again on a terminal-settings change and stays quiet otherwise", () => {
    const ghosttyUpdateConfig = vi.fn().mockResolvedValue(undefined);
    setShell(createFakeShell({ ghosttyUpdateConfig }).shell);
    try {
      const settings = makeSettings();
      const store = createStore(() => ({ settings, loaded: true }));
      syncGhosttySettingsToMain(store as unknown as typeof settingsStore);
      ghosttyUpdateConfig.mockClear();

      // An unrelated slice must not reload every surface.
      store.setState({
        settings: { ...settings, general: { ...settings.general, enableTelnet: true } }
      });
      expect(ghosttyUpdateConfig).not.toHaveBeenCalled();

      store.setState({
        settings: { ...settings, terminal: { ...settings.terminal, fontSize: 18 } }
      });
      expect(ghosttyUpdateConfig).toHaveBeenCalledTimes(1);
      expect(ghosttyUpdateConfig.mock.calls[0][0].fontSize).toBe(18);
    } finally {
      setShell(null);
    }
  });
});
