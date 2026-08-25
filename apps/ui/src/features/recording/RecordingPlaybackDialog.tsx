import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RecordingFrame, RecordingFramesResponse } from "@hypershell/shared";

import { Modal } from "../layout/Modal";
import { getShell, hasShell } from "../../lib/shell";
import { useReplaySurface } from "./useReplaySurface";

function formatDurationFromFrames(frames: RecordingFrame[]): string {
  if (frames.length === 0) {
    return "0:00";
  }
  const totalSeconds = Math.floor(frames[frames.length - 1][0]);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export interface RecordingPlaybackDialogProps {
  open: boolean;
  recordingId: string | null;
  onClose: () => void;
}

/**
 * Plays a recording back through a native replay surface (Task 3/10)
 * instead of an in-renderer xterm instance: main paces the recorded frames
 * through client.feedData on their own recorded timestamps, so this
 * component's job is just the surface's container + bounds reporting
 * (useReplaySurface) and forwarding play/pause/seek button presses to
 * ghosttyReplayControl. It still fetches the recording's frames once — not
 * to render them, only for the duration/frame-count metadata the transport
 * controls display.
 */
export function RecordingPlaybackDialog({
  open,
  recordingId,
  onClose,
}: RecordingPlaybackDialogProps) {
  const [payload, setPayload] = useState<RecordingFramesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  // Renderer-local only: reflects the last explicit seek, not a live-updating
  // playhead — the driver doesn't report per-frame playback progress back
  // (out of this task's scope), so during Play this number just stays put
  // rather than pretending to track the native surface frame-by-frame.
  const [cursor, setCursor] = useState(0);

  const { containerRef, replayId, error: surfaceError } = useReplaySurface(recordingId, open);

  const frames = useMemo(() => payload?.frames ?? [], [payload]);
  const recordingTitle = payload?.recording.title ?? "Playback";
  const totalDuration = useMemo(() => formatDurationFromFrames(frames), [frames]);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setCursor(0);
      setPayload(null);
      return;
    }

    if (!recordingId || !hasShell()) {
      return;
    }

    setLoading(true);
    setPlaying(false);
    setCursor(0);

    void getShell()
      .recordingGetFrames({ id: recordingId })
      .then((response) => {
        setPayload(response);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load recording");
        onClose();
      })
      .finally(() => {
        setLoading(false);
      });
  }, [onClose, open, recordingId]);

  useEffect(() => {
    if (surfaceError) {
      toast.error(surfaceError);
    }
  }, [surfaceError]);

  const sendControl = (action: "play" | "pause" | "seek", frameIndex?: number) => {
    if (!replayId || !hasShell()) return;
    void getShell()
      .ghosttyReplayControl({ replayId, action, frameIndex })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Playback control failed");
      });
  };

  const togglePlaying = () => {
    setPlaying((prev) => {
      const next = !prev;
      sendControl(next ? "play" : "pause");
      return next;
    });
  };

  const seek = (nextCursor: number) => {
    const clamped = Math.max(0, Math.min(nextCursor, frames.length));
    setPlaying(false);
    setCursor(clamped);
    sendControl("seek", clamped);
  };

  return (
    <Modal open={open} onClose={onClose} title={`Playback: ${recordingTitle}`}>
      <div className="grid gap-3">
        <div className="h-80 rounded-lg border border-border bg-black/80 overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-text-muted">
              Loading recording...
            </div>
          ) : (
            <div ref={containerRef} className="h-full w-full" />
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              Frame {cursor}/{frames.length}
            </span>
            <span>Duration {totalDuration}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(frames.length, 1)}
            value={Math.min(cursor, Math.max(frames.length, 1))}
            onChange={(e) => seek(Number.parseInt(e.target.value, 10))}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlaying}
              disabled={loading || frames.length === 0 || !replayId}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => seek(0)}
              disabled={loading || frames.length === 0 || !replayId}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50"
            >
              Restart
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
