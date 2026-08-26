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
  /** The host process gave up respawning. Tells every live surface's session
   *  so its pane can show the failure and offer a retry — a dead host is
   *  otherwise indistinguishable from an idle terminal. */
  onHostDead(reason: string): void;
}

/**
 * Calls that arrive for a session whose surface hasn't been created yet.
 *
 * Surface creation is asynchronous on the renderer side (it awaits
 * `ensureHostStarted` before `createSurface`), while visibility, bounds and
 * focus go through synchronous handlers. On a cold start with restored tabs
 * every hidden tab pushes `setVisible(false)` while its create is still in
 * flight; dropping those left every surface visible and stacked. They are
 * remembered here instead and applied when the surface appears.
 */
interface PendingSurfaceState {
  visible?: boolean;
  bounds?: Bounds;
  focus?: boolean;
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

/** Frames to the host are capped at 1 MiB of payload and an oversize one kills
 *  the connection outright (wire protocol, Limits), so terminal output is split
 *  rather than sent whole. */
const MAX_FRAME_PAYLOAD = 1024 * 1024;

function isValidGridDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function createGhosttyHostClient(opts: CreateGhosttyHostClientOptions): GhosttyHostClient {
  const registry = new Map<string, SurfaceEntry>();
  const surfaceIdToSessionId = new Map<number, string>();
  const pending = new Map<string, PendingSurfaceState>();
  let nextSurfaceId = 1;
  let nextReplayId = 1;
  /** DOM-overlay airspace guard state (Task 8) — composed with each entry's
   *  surfaceVisible, except for exempt (replay) entries. */
  let overlayVisible = true;

  function register(sessionId: string, entry: SurfaceEntry): void {
    const existing = registry.get(sessionId);
    if (existing) {
      // A renderer reload re-creates surfaces for ids main still holds. Without
      // this the old native surface stays alive with nothing addressing it,
      // painting over its replacement.
      opts.host.send(FrameType.destroySurface, existing.surfaceId, "");
      surfaceIdToSessionId.delete(existing.surfaceId);
    }
    registry.set(sessionId, entry);
    surfaceIdToSessionId.set(entry.surfaceId, sessionId);
  }

  function rememberPending(sessionId: string, patch: PendingSurfaceState): void {
    pending.set(sessionId, { ...pending.get(sessionId), ...patch });
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
      // Anything that arrived while the create was in flight is newer than the
      // create's own arguments, so it wins.
      const queued = pending.get(sessionId);
      pending.delete(sessionId);
      const entry: SurfaceEntry = {
        surfaceId,
        parentHwnd,
        bounds: queued?.bounds ?? bounds,
        surfaceVisible: queued?.visible ?? true,
        exemptFromOverlayGuard: false,
        surfaceConfig
      };
      register(sessionId, entry);
      sendCreateSurface(entry);
      // The host creates every surface visible, so a surface that must not be
      // (a background tab, or any surface born while a DOM overlay holds the
      // airspace guard) needs telling right away.
      if (!effectiveVisible(entry)) {
        sendVisibility(entry);
      }
      if (queued?.focus) {
        opts.host.send(FrameType.focus, entry.surfaceId, "");
      }
    },

    destroySurface(sessionId) {
      pending.delete(sessionId);
      const entry = registry.get(sessionId);
      if (!entry) return;
      opts.host.send(FrameType.destroySurface, entry.surfaceId, "");
      registry.delete(sessionId);
      surfaceIdToSessionId.delete(entry.surfaceId);
    },

    setBounds(sessionId, b) {
      const entry = registry.get(sessionId);
      if (!entry) {
        rememberPending(sessionId, { bounds: b });
        return;
      }
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
      if (!entry) {
        rememberPending(sessionId, { visible });
        return;
      }
      entry.surfaceVisible = visible;
      sendVisibility(entry);
    },

    focus(sessionId) {
      const entry = registry.get(sessionId);
      if (!entry) {
        rememberPending(sessionId, { focus: true });
        return;
      }
      opts.host.send(FrameType.focus, entry.surfaceId, "");
    },

    feedData(sessionId, data) {
      const entry = registry.get(sessionId);
      if (!entry) return;
      const payload = Buffer.from(data, "utf8");
      if (payload.length <= MAX_FRAME_PAYLOAD) {
        opts.host.send(FrameType.feedData, entry.surfaceId, payload);
        return;
      }
      // Splitting mid-sequence (or mid-codepoint) is safe: the far side is a
      // byte-oriented VT parser reading one ordered stream.
      for (let offset = 0; offset < payload.length; offset += MAX_FRAME_PAYLOAD) {
        opts.host.send(
          FrameType.feedData,
          entry.surfaceId,
          payload.subarray(offset, offset + MAX_FRAME_PAYLOAD)
        );
      }
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
      pending.clear();
    },

    onFrame(frame) {
      const sessionId = surfaceIdToSessionId.get(frame.surfaceId);
      if (!sessionId) return;

      // Every JSON payload below comes off the socket inside node's `data`
      // handler, outside the decoder's own try/catch — an unparseable one used
      // to take the whole main process down. A malformed frame is dropped.
      let parsed: Record<string, unknown>;
      switch (frame.type) {
        case FrameType.input: {
          const data = frame.payload.toString();
          const targets = opts.getBroadcastTargets() ?? [sessionId];
          for (const target of targets) {
            opts.writeSession(target, data);
          }
          return;
        }
        case FrameType.bell:
          opts.emitGhosttyEvent({ kind: "bell", sessionId });
          return;
        case FrameType.focusGained:
          opts.emitGhosttyEvent({ kind: "focusGained", sessionId });
          return;
        case FrameType.focusLost:
          opts.emitGhosttyEvent({ kind: "focusLost", sessionId });
          return;
        case FrameType.gridSize:
        case FrameType.title:
        case FrameType.passthroughChord:
        case FrameType.surfaceCrashed: {
          try {
            parsed = JSON.parse(frame.payload.toString()) as Record<string, unknown>;
          } catch (error) {
            console.error(
              `[ghostty] dropping malformed frame 0x${frame.type.toString(16)} for ${sessionId}`,
              error
            );
            return;
          }
          break;
        }
        default:
          return;
      }

      switch (frame.type) {
        case FrameType.gridSize: {
          const { cols, rows } = parsed;
          if (!isValidGridDimension(cols) || !isValidGridDimension(rows)) {
            console.error(`[ghostty] dropping gridSize frame with invalid dimensions for ${sessionId}`);
            return;
          }
          opts.resizeSession(sessionId, cols, rows);
          opts.emitGhosttyEvent({ kind: "grid", sessionId, cols, rows });
          break;
        }
        case FrameType.title: {
          if (typeof parsed.title !== "string") return;
          opts.emitGhosttyEvent({ kind: "title", sessionId, title: parsed.title });
          break;
        }
        case FrameType.passthroughChord: {
          if (typeof parsed.chord !== "string") return;
          opts.emitGhosttyEvent({ kind: "chord", sessionId, chord: parsed.chord });
          break;
        }
        case FrameType.surfaceCrashed: {
          opts.emitGhosttyEvent({
            kind: "crashed",
            sessionId,
            error: typeof parsed.error === "string" ? parsed.error : undefined
          });
          break;
        }
        default:
          break;
      }
    },

    onHostDead(reason) {
      // The host has given up respawning, so every surface died with it and
      // every surfaceId it handed out is meaningless. The registry is emptied
      // rather than kept: a retry creates a fresh surface, and a stale entry
      // would only make that retry send a destroy for an id no host knows.
      for (const sessionId of registry.keys()) {
        opts.emitGhosttyEvent({ kind: "crashed", sessionId, error: reason });
      }
      registry.clear();
      surfaceIdToSessionId.clear();
      pending.clear();
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
