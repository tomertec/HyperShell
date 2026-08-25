import type { RecordingFrame } from "@hypershell/shared";
import type { Bounds, GhosttyHostClient } from "./ghosttyHostClient";

export type ReplayAction = "play" | "pause" | "seek";

export interface CreateReplayDriverOptions {
  client: GhosttyHostClient;
  /** Recordings are DB rows (recorder.getFrames), not files — see the plan's
   *  Global Constraints spec deviation. `id` is the recording's row id. */
  getFrames: (recordingId: string) => Promise<RecordingFrame[]>;
}

export interface ReplayDriver {
  open(recordingId: string, parentHwnd: string, bounds: Bounds): Promise<string>;
  control(replayId: string, action: ReplayAction, frameIndex?: number): void;
  close(replayId: string): void;
}

interface ReplayState {
  frames: RecordingFrame[];
  /** Index of the next frame to feed — how many frames have been fed so far. */
  cursor: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** RecordingFrame is `[timestampSeconds, "o", data]` (asciinema-cast-v2-style
 *  tuple) — see packages/shared/src/ipc/schemas.ts's recordingFrameSchema. */
const TIMESTAMP_INDEX = 0;
const DATA_INDEX = 2;

export function createReplayDriver(opts: CreateReplayDriverOptions): ReplayDriver {
  const states = new Map<string, ReplayState>();

  function clearPlaybackTimer(state: ReplayState): void {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
  }

  function scheduleNext(replayId: string, state: ReplayState): void {
    if (state.cursor >= state.frames.length) {
      return;
    }
    const frame = state.frames[state.cursor];
    const previousTimestamp = state.cursor === 0 ? 0 : state.frames[state.cursor - 1][TIMESTAMP_INDEX];
    const delaySeconds = Math.max(0, frame[TIMESTAMP_INDEX] - previousTimestamp);

    state.timer = setTimeout(() => {
      state.timer = null;
      opts.client.feedData(replayId, frame[DATA_INDEX]);
      state.cursor += 1;
      scheduleNext(replayId, state);
    }, delaySeconds * 1000);
  }

  return {
    async open(recordingId, parentHwnd, bounds) {
      const frames = await opts.getFrames(recordingId);
      const replayId = opts.client.createReplaySurface(parentHwnd, bounds);
      states.set(replayId, { frames, cursor: 0, timer: null });
      return replayId;
    },

    control(replayId, action, frameIndex) {
      const state = states.get(replayId);
      if (!state) return;

      switch (action) {
        case "play":
          clearPlaybackTimer(state);
          scheduleNext(replayId, state);
          break;

        case "pause":
          clearPlaybackTimer(state);
          break;

        case "seek": {
          clearPlaybackTimer(state);
          const target = Math.max(0, Math.min(frameIndex ?? 0, state.frames.length));
          opts.client.sendCommand(replayId, "clear");
          for (let i = 0; i < target; i += 1) {
            opts.client.feedData(replayId, state.frames[i][DATA_INDEX]);
          }
          state.cursor = target;
          break;
        }

        default:
          break;
      }
    },

    close(replayId) {
      const state = states.get(replayId);
      if (!state) return;
      clearPlaybackTimer(state);
      states.delete(replayId);
      opts.client.destroySurface(replayId);
    }
  };
}
