import { FrameType, type Frame } from "./protocol";
import type { GhosttyHostProcess } from "./hostProcess";

export type Bounds = { x: number; y: number; w: number; h: number };

export type GhosttyRendererEvent = {
  kind: "grid" | "title" | "bell" | "chord" | "focusGained" | "focusLost" | "crashed";
  sessionId: string;
  cols?: number;
  rows?: number;
  title?: string;
  chord?: string;
  error?: string;
};

export interface CreateGhosttyHostClientOptions {
  host: GhosttyHostProcess;
  writeSession: (sessionId: string, data: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  emitGhosttyEvent: (event: GhosttyRendererEvent) => void;
  getBroadcastTargets: () => string[] | null;
  getGlobalConfig: () => string;
}

/**
 * `onFrame`/`onRestart` are not part of the brief's IPC-facing method list —
 * they exist because Task 2's GhosttyHostProcess only accepts onFrame/onRestart
 * as constructor-time callbacks, before this client can exist. The caller that
 * wires host + client together resolves the ordering with a forward reference:
 *
 *   let client: GhosttyHostClient;
 *   const host = createGhosttyHostProcess({
 *     exePath,
 *     onFrame: (f) => client.onFrame(f),
 *     onRestart: () => client.onRestart(),
 *     onDead
 *   });
 *   client = createGhosttyHostClient({ host, ... });
 */
export interface GhosttyHostClient {
  createSurface(sessionId: string, parentHwnd: string, bounds: Bounds, surfaceConfig?: string): void;
  destroySurface(sessionId: string): void;
  setBounds(sessionId: string, b: Bounds): void;
  /** DOM-overlay airspace guard (Task 8): hides/shows every non-exempt
   *  surface, composed with each surface's own setVisible flag — a surface
   *  is only actually shown when both are true. Surfaces created via
   *  createReplaySurface are exempt and stay under their own setVisible
   *  control regardless of this. */
  setOverlayVisible(visible: boolean): void;
  setVisible(sessionId: string, visible: boolean): void;
  focus(sessionId: string): void;
  feedData(sessionId: string, data: string): void;
  sessionClosed(sessionId: string, exitCode: number | null): void;
  updateGlobalConfig(): void;
  updateSurfaceConfig(sessionId: string, config: string): void;
  sendCommand(sessionId: string, cmd: string): void;
  createReplaySurface(parentHwnd: string, bounds: Bounds): string;
  dispose(): void;
  onFrame(frame: Frame): void;
  onRestart(): void;
}

interface SurfaceEntry {
  surfaceId: number;
  parentHwnd: string;
  bounds: Bounds;
  /** This surface's own setVisible flag (tab visibility, etc.) — independent
   *  of the DOM-overlay guard. */
  surfaceVisible: boolean;
  /** Replay surfaces (createReplaySurface) are exempt: the overlay guard
   *  never hides them, so they stay under surfaceVisible's control alone. */
  exemptFromOverlayGuard: boolean;
  surfaceConfig: string | undefined;
}

const GLOBAL_SURFACE_ID = 0;

export function createGhosttyHostClient(opts: CreateGhosttyHostClientOptions): GhosttyHostClient {
  const registry = new Map<string, SurfaceEntry>();
  const surfaceIdToSessionId = new Map<number, string>();
  let nextSurfaceId = 1;
  let nextReplayId = 1;
  /** DOM-overlay airspace guard state (Task 8) — composed with each entry's
   *  surfaceVisible, except for exempt (replay) entries. */
  let overlayVisible = true;

  function register(sessionId: string, entry: SurfaceEntry): void {
    const existing = registry.get(sessionId);
    if (existing) {
      surfaceIdToSessionId.delete(existing.surfaceId);
    }
    registry.set(sessionId, entry);
    surfaceIdToSessionId.set(entry.surfaceId, sessionId);
  }

  function sendCreateSurface(entry: SurfaceEntry): void {
    const config = entry.surfaceConfig ?? opts.getGlobalConfig();
    opts.host.send(
      FrameType.createSurface,
      entry.surfaceId,
      JSON.stringify({
        parentHwnd: entry.parentHwnd,
        x: entry.bounds.x,
        y: entry.bounds.y,
        w: entry.bounds.w,
        h: entry.bounds.h,
        config
      })
    );
  }

  function effectiveVisible(entry: SurfaceEntry): boolean {
    return entry.exemptFromOverlayGuard ? entry.surfaceVisible : overlayVisible && entry.surfaceVisible;
  }

  function sendVisibility(entry: SurfaceEntry): void {
    opts.host.send(FrameType.setVisible, entry.surfaceId, JSON.stringify({ visible: effectiveVisible(entry) }));
  }

  return {
    createSurface(sessionId, parentHwnd, bounds, surfaceConfig) {
      const surfaceId = nextSurfaceId++;
      const entry: SurfaceEntry = {
        surfaceId,
        parentHwnd,
        bounds,
        surfaceVisible: true,
        exemptFromOverlayGuard: false,
        surfaceConfig
      };
      register(sessionId, entry);
      sendCreateSurface(entry);
    },

    destroySurface(sessionId) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      opts.host.send(FrameType.destroySurface, entry.surfaceId, "");
      registry.delete(sessionId);
      surfaceIdToSessionId.delete(entry.surfaceId);
    },

    setBounds(sessionId, b) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      entry.bounds = b;
      opts.host.send(FrameType.setBounds, entry.surfaceId, JSON.stringify(b));
    },

    setOverlayVisible(visible) {
      overlayVisible = visible;
      for (const entry of registry.values()) {
        if (entry.exemptFromOverlayGuard) continue;
        sendVisibility(entry);
      }
    },

    setVisible(sessionId, visible) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      entry.surfaceVisible = visible;
      sendVisibility(entry);
    },

    focus(sessionId) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      opts.host.send(FrameType.focus, entry.surfaceId, "");
    },

    feedData(sessionId, data) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      opts.host.send(FrameType.feedData, entry.surfaceId, data);
    },

    sessionClosed(sessionId, exitCode) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      const payload = exitCode === null ? {} : { exitCode };
      opts.host.send(FrameType.sessionClosed, entry.surfaceId, JSON.stringify(payload));
    },

    updateGlobalConfig() {
      opts.host.send(FrameType.updateConfig, GLOBAL_SURFACE_ID, opts.getGlobalConfig());
    },

    updateSurfaceConfig(sessionId, config) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      entry.surfaceConfig = config;
      opts.host.send(FrameType.updateConfig, entry.surfaceId, config);
    },

    sendCommand(sessionId, cmd) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      opts.host.send(FrameType.command, entry.surfaceId, JSON.stringify({ cmd }));
    },

    createReplaySurface(parentHwnd, bounds) {
      const surfaceId = nextSurfaceId++;
      const sessionId = `replay:${nextReplayId++}`;
      const entry: SurfaceEntry = {
        surfaceId,
        parentHwnd,
        bounds,
        surfaceVisible: true,
        exemptFromOverlayGuard: true,
        surfaceConfig: undefined
      };
      register(sessionId, entry);
      sendCreateSurface(entry);
      return sessionId;
    },

    dispose() {
      for (const entry of registry.values()) {
        opts.host.send(FrameType.destroySurface, entry.surfaceId, "");
      }
      registry.clear();
      surfaceIdToSessionId.clear();
    },

    onFrame(frame) {
      const sessionId = surfaceIdToSessionId.get(frame.surfaceId);
      if (!sessionId) return;

      switch (frame.type) {
        case FrameType.input: {
          const data = frame.payload.toString();
          const targets = opts.getBroadcastTargets() ?? [sessionId];
          for (const target of targets) {
            opts.writeSession(target, data);
          }
          break;
        }
        case FrameType.gridSize: {
          const parsed = JSON.parse(frame.payload.toString()) as { cols: number; rows: number };
          opts.resizeSession(sessionId, parsed.cols, parsed.rows);
          opts.emitGhosttyEvent({ kind: "grid", sessionId, cols: parsed.cols, rows: parsed.rows });
          break;
        }
        case FrameType.title: {
          const parsed = JSON.parse(frame.payload.toString()) as { title: string };
          opts.emitGhosttyEvent({ kind: "title", sessionId, title: parsed.title });
          break;
        }
        case FrameType.bell:
          opts.emitGhosttyEvent({ kind: "bell", sessionId });
          break;
        case FrameType.passthroughChord: {
          const parsed = JSON.parse(frame.payload.toString()) as { chord: string };
          opts.emitGhosttyEvent({ kind: "chord", sessionId, chord: parsed.chord });
          break;
        }
        case FrameType.focusGained:
          opts.emitGhosttyEvent({ kind: "focusGained", sessionId });
          break;
        case FrameType.focusLost:
          opts.emitGhosttyEvent({ kind: "focusLost", sessionId });
          break;
        case FrameType.surfaceCrashed: {
          const parsed = JSON.parse(frame.payload.toString()) as { error?: string };
          opts.emitGhosttyEvent({ kind: "crashed", sessionId, error: parsed.error });
          break;
        }
        default:
          break;
      }
    },

    onRestart() {
      opts.host.send(FrameType.updateConfig, GLOBAL_SURFACE_ID, opts.getGlobalConfig());
      for (const entry of registry.values()) {
        sendCreateSurface(entry);
        sendVisibility(entry);
      }
    }
  };
}
