import { BrowserWindow } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import {
  ipcChannels,
  ghosttySurfaceCreateRequestSchema,
  ghosttySurfaceDestroyRequestSchema,
  ghosttySurfaceBoundsRequestSchema,
  ghosttySurfaceVisibleRequestSchema,
  ghosttySurfaceFocusRequestSchema,
  ghosttySurfaceCommandRequestSchema,
  ghosttySurfaceConfigRequestSchema,
  ghosttyOverlayGuardRequestSchema,
  ghosttyUpdateConfigRequestSchema,
  ghosttyReplayOpenRequestSchema,
  ghosttyReplayControlRequestSchema,
  ghosttyReplayCloseRequestSchema,
  setBroadcastTargetsRequestSchema,
  type SetBroadcastTargetsRequest
} from "@hypershell/shared";
import type { GhosttyHostClient } from "../ghosttyHost/ghosttyHostClient";
import type { ReplayDriver } from "../ghosttyHost/replayDriver";
import {
  composeGhosttySurfaceConfig,
  ghosttyConfigFromSettings,
  ghosttyFontSizeOverride,
  type ResolvedGhosttyTheme
} from "../ghosttyHost/ghosttyConfigFromSettings";
import type { IpcMainLike } from "./registerIpc";

// Same order as ghosttyConfigFromSettings.ts's private PALETTE_ORDER —
// standard ANSI + bright-ANSI, palette indices 0-15.
const PALETTE_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite"
] as const;

function toResolvedGhosttyTheme(theme: {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  selectionForeground: string;
  palette: string[];
}): ResolvedGhosttyTheme {
  const paletteFields = Object.fromEntries(
    PALETTE_KEYS.map((key, index) => [key, theme.palette[index]])
  ) as Record<(typeof PALETTE_KEYS)[number], string>;

  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    selectionBackground: theme.selectionBackground,
    selectionForeground: theme.selectionForeground,
    ...paletteFields
  };
}

function resolveParentHwnd(event: IpcMainInvokeEvent): string {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    throw new Error("ghostty surface has no owning window");
  }
  return win.getNativeWindowHandle().readBigUInt64LE(0).toString();
}

export interface RegisterGhosttyIpcOptions {
  /** null when the host path couldn't be resolved (e.g. dev without
   * GHOSTTY_HOST_PATH) — every handler below then fails loudly instead of
   * silently no-oping, so a missing terminal renderer is never mistaken for
   * one that's merely idle. */
  client: GhosttyHostClient | null;
  /** Same null-when-unavailable contract as `client` — constructed from the
   * same client instance, so it's null exactly when `client` is. */
  replayDriver: ReplayDriver | null;
  /** Lazily starts the host process; resolves once, or rejects if the host
   * process is unavailable. Called before the first surface is created. */
  ensureHostStarted: () => Promise<void>;
  /** The current global config text. Per-surface configs are built on top of
   *  it rather than replacing it — see composeGhosttySurfaceConfig. */
  getGlobalConfigBlob: () => string;
  setGlobalConfigBlob: (blob: string) => void;
  setBroadcastState: (state: SetBroadcastTargetsRequest) => void;
}

function requireClient(client: GhosttyHostClient | null): GhosttyHostClient {
  if (!client) {
    throw new Error(
      "ghostty is unavailable: the host process path could not be resolved (see GHOSTTY_HOST_PATH)"
    );
  }
  return client;
}

function requireReplayDriver(driver: ReplayDriver | null): ReplayDriver {
  if (!driver) {
    throw new Error(
      "ghostty is unavailable: the host process path could not be resolved (see GHOSTTY_HOST_PATH)"
    );
  }
  return driver;
}

export function registerGhosttyIpc(
  ipcMain: IpcMainLike,
  options: RegisterGhosttyIpcOptions
): () => void {
  ipcMain.handle(
    ipcChannels.ghostty.surfaceCreate,
    async (event: IpcMainInvokeEvent, rawRequest: unknown) => {
      const request = ghosttySurfaceCreateRequestSchema.parse(rawRequest);
      const client = requireClient(options.client);
      const parentHwnd = resolveParentHwnd(event);
      await options.ensureHostStarted();
      // A per-tab font size is a surface-scoped override of the global config,
      // applied at birth so the surface never renders a frame at the wrong size.
      const surfaceConfig =
        request.fontSize === undefined
          ? undefined
          : composeGhosttySurfaceConfig(
              options.getGlobalConfigBlob(),
              ghosttyFontSizeOverride(request.fontSize)
            );
      client.createSurface(request.sessionId, parentHwnd, request.bounds, surfaceConfig);
    }
  );

  ipcMain.handle(ipcChannels.ghostty.surfaceDestroy, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttySurfaceDestroyRequestSchema.parse(rawRequest);
    requireClient(options.client).destroySurface(request.sessionId);
  });

  ipcMain.handle(ipcChannels.ghostty.surfaceBounds, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttySurfaceBoundsRequestSchema.parse(rawRequest);
    requireClient(options.client).setBounds(request.sessionId, request.bounds);
  });

  ipcMain.handle(ipcChannels.ghostty.surfaceVisible, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttySurfaceVisibleRequestSchema.parse(rawRequest);
    requireClient(options.client).setVisible(request.sessionId, request.visible);
  });

  ipcMain.handle(ipcChannels.ghostty.surfaceFocus, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttySurfaceFocusRequestSchema.parse(rawRequest);
    requireClient(options.client).focus(request.sessionId);
  });

  ipcMain.handle(ipcChannels.ghostty.surfaceCommand, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttySurfaceCommandRequestSchema.parse(rawRequest);
    requireClient(options.client).sendCommand(request.sessionId, request.command);
  });

  ipcMain.handle(ipcChannels.ghostty.surfaceConfig, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttySurfaceConfigRequestSchema.parse(rawRequest);
    // The renderer sends only the override lines it cares about (a font size);
    // main owns the global blob they layer onto, so the renderer never has to
    // reproduce the whole config text.
    requireClient(options.client).updateSurfaceConfig(
      request.sessionId,
      composeGhosttySurfaceConfig(options.getGlobalConfigBlob(), request.config)
    );
  });

  ipcMain.handle(ipcChannels.ghostty.overlayGuard, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttyOverlayGuardRequestSchema.parse(rawRequest);
    requireClient(options.client).setOverlayVisible(!request.hidden);
  });

  ipcMain.handle(ipcChannels.ghostty.updateConfig, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttyUpdateConfigRequestSchema.parse(rawRequest);
    const client = requireClient(options.client);
    const blob = ghosttyConfigFromSettings({
      fontFamily: request.fontFamily,
      fontSize: request.fontSize,
      lineHeight: request.lineHeight,
      cursorBlink: request.cursorBlink,
      scrollback: request.scrollback,
      theme: toResolvedGhosttyTheme(request.theme)
    });
    options.setGlobalConfigBlob(blob);
    client.updateGlobalConfig();
  });

  ipcMain.handle(
    ipcChannels.ghostty.replayOpen,
    async (event: IpcMainInvokeEvent, rawRequest: unknown) => {
      const request = ghosttyReplayOpenRequestSchema.parse(rawRequest);
      const driver = requireReplayDriver(options.replayDriver);
      const parentHwnd = resolveParentHwnd(event);
      await options.ensureHostStarted();
      const replayId = await driver.open(request.recordingId, parentHwnd, request.bounds);
      return { replayId };
    }
  );

  ipcMain.handle(ipcChannels.ghostty.replayControl, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttyReplayControlRequestSchema.parse(rawRequest);
    requireReplayDriver(options.replayDriver).control(request.replayId, request.action, request.frameIndex);
  });

  ipcMain.handle(ipcChannels.ghostty.replayClose, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = ghosttyReplayCloseRequestSchema.parse(rawRequest);
    requireReplayDriver(options.replayDriver).close(request.replayId);
  });

  ipcMain.handle(ipcChannels.session.broadcastTargets, (_event: IpcMainInvokeEvent, rawRequest: unknown) => {
    const request = setBroadcastTargetsRequestSchema.parse(rawRequest);
    options.setBroadcastState(request);
  });

  return () => {
    for (const channel of Object.values(ipcChannels.ghostty)) {
      ipcMain.removeHandler?.(channel);
    }
    ipcMain.removeHandler?.(ipcChannels.session.broadcastTargets);
  };
}
