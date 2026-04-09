import { useEffect, useState } from "react";
import { toast } from "sonner";

import { RecordingBrowserDialog } from "../recording/RecordingBrowserDialog";
import { RecordingPlaybackDialog } from "../recording/RecordingPlaybackDialog";

export interface LoggingButtonProps {
  sessionId: string;
  hostId?: string | null;
  title?: string;
  width?: number;
  height?: number;
}

export function LoggingButton({
  sessionId,
  hostId,
  title,
  width = 80,
  height = 24,
}: LoggingButtonProps) {
  const [loggingActive, setLoggingActive] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [playbackRecordingId, setPlaybackRecordingId] = useState<string | null>(null);

  useEffect(() => {
    window.hypershell?.loggingGetState?.({ sessionId }).then((state) => {
      setLoggingActive(state.active);
    }).catch(() => {
      setLoggingActive(false);
    });

    window.hypershell?.recordingGetState?.({ sessionId }).then((state) => {
      setRecordingActive(state.active);
    }).catch(() => {
      setRecordingActive(false);
    });
  }, [sessionId]);

  const toggleLogging = async () => {
    try {
      if (loggingActive) {
        await window.hypershell?.loggingStop?.({ sessionId });
        setLoggingActive(false);
        toast.success("Session text logging stopped");
      } else {
        const defaultName = `session-${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
        const filePath = await window.hypershell?.fsShowSaveDialog?.({
          defaultPath: defaultName,
          filters: [{ name: "Log Files", extensions: ["log", "txt"] }],
        });
        if (!filePath) return;
        await window.hypershell?.loggingStart?.({ sessionId, filePath });
        setLoggingActive(true);
        toast.success("Session text logging started");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logging failed");
    }
  };

  const toggleRecording = async () => {
    try {
      if (recordingActive) {
        await window.hypershell?.recordingStop?.({ sessionId });
        setRecordingActive(false);
        toast.success("Session recording stopped");
      } else {
        await window.hypershell?.recordingStart?.({
          sessionId,
          hostId: hostId ?? null,
          title,
          width,
          height,
        });
        setRecordingActive(true);
        toast.success("Session recording started");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recording failed");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={() => void toggleLogging()}
          className={`p-1 rounded transition-colors ${
            loggingActive ? "text-yellow-300 hover:text-yellow-200" : "text-text-muted hover:text-text-primary"
          }`}
          title={loggingActive ? "Stop text logging" : "Start text logging"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 3.25h8M2 6h8M2 8.75h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>

        <button
          onClick={() => void toggleRecording()}
          className={`p-1 rounded transition-colors ${
            recordingActive ? "text-red-400 hover:text-red-300" : "text-text-muted hover:text-text-primary"
          }`}
          title={recordingActive ? "Stop recording (.cast)" : "Start recording (.cast)"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="6" cy="6" r={recordingActive ? 5 : 4} />
          </svg>
        </button>

        <button
          onClick={() => setBrowserOpen(true)}
          className="p-1 rounded text-text-muted hover:text-text-primary transition-colors"
          title="Browse recordings"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1.5 3h3l1 1h5a1 1 0 011 1v4.5a1 1 0 01-1 1h-9a1 1 0 01-1-1V4a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <RecordingBrowserDialog
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onPlay={(recordingId) => {
          setBrowserOpen(false);
          setPlaybackRecordingId(recordingId);
        }}
      />

      <RecordingPlaybackDialog
        open={playbackRecordingId !== null}
        recordingId={playbackRecordingId}
        onClose={() => setPlaybackRecordingId(null)}
      />
    </>
  );
}
