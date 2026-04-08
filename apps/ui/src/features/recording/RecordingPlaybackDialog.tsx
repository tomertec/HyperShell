import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import { toast } from "sonner";
import type { RecordingFrame, RecordingFramesResponse } from "@sshterm/shared";

import { Modal } from "../layout/Modal";

const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const;

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

export function RecordingPlaybackDialog({
  open,
  recordingId,
  onClose,
}: RecordingPlaybackDialogProps) {
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [payload, setPayload] = useState<RecordingFramesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  const frames = payload?.frames ?? [];
  const recordingTitle = payload?.recording.title ?? "Playback";
  const totalDuration = useMemo(() => formatDurationFromFrames(frames), [frames]);

  const clearPlaybackTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const renderToCursor = useCallback(
    (nextCursor: number) => {
      const term = terminalRef.current;
      if (!term) {
        return;
      }

      term.reset();
      for (let i = 0; i < nextCursor; i += 1) {
        term.write(frames[i][2]);
      }
    },
    [frames]
  );

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setCursor(0);
      setPayload(null);
      clearPlaybackTimer();
      return;
    }

    if (!recordingId || !window.sshterm?.recordingGetFrames) {
      return;
    }

    setLoading(true);
    setPlaying(false);
    setCursor(0);

    void window.sshterm
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
  }, [clearPlaybackTimer, onClose, open, recordingId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let disposed = false;

    void (async () => {
      const { Terminal: XTerm } = await import("@xterm/xterm");
      if (disposed || !terminalContainerRef.current) {
        return;
      }

      const term = new XTerm({
        convertEol: false,
        disableStdin: true,
        rows: payload?.header.height,
        cols: payload?.header.width,
      });
      term.open(terminalContainerRef.current);
      terminalRef.current = term;
      renderToCursor(cursor);
    })();

    return () => {
      disposed = true;
      clearPlaybackTimer();
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, [clearPlaybackTimer, cursor, open, payload?.header.height, payload?.header.width, renderToCursor]);

  useEffect(() => {
    renderToCursor(cursor);
  }, [cursor, renderToCursor]);

  useEffect(() => {
    if (!playing) {
      clearPlaybackTimer();
      return;
    }

    if (cursor >= frames.length) {
      setPlaying(false);
      return;
    }

    const delayMs = (() => {
      if (cursor === 0) {
        return (frames[0][0] * 1000) / speed;
      }
      const delta = frames[cursor][0] - frames[cursor - 1][0];
      return (Math.max(0, delta) * 1000) / speed;
    })();

    timerRef.current = setTimeout(() => {
      setCursor((prev) => Math.min(prev + 1, frames.length));
    }, delayMs);

    return clearPlaybackTimer;
  }, [clearPlaybackTimer, cursor, frames, playing, speed]);

  const seek = (nextCursor: number) => {
    setPlaying(false);
    setCursor(Math.max(0, Math.min(nextCursor, frames.length)));
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
            <div ref={terminalContainerRef} className="h-full w-full" />
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
              onClick={() => setPlaying((prev) => !prev)}
              disabled={loading || frames.length === 0}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => seek(0)}
              disabled={loading || frames.length === 0}
              className="rounded border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50"
            >
              Restart
            </button>
          </div>

          <div className="flex items-center gap-1">
            {PLAYBACK_SPEEDS.map((candidateSpeed) => (
              <button
                key={candidateSpeed}
                type="button"
                onClick={() => setSpeed(candidateSpeed)}
                className={`rounded px-2 py-1 text-xs border transition-colors ${
                  speed === candidateSpeed
                    ? "border-accent-dim bg-accent/10 text-accent"
                    : "border-border text-text-muted hover:text-text-primary hover:border-border-bright"
                }`}
              >
                {candidateSpeed}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
