import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { SessionRecordingRecord } from "@hypershell/shared";

import { Modal } from "../layout/Modal";

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) {
    return "-";
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSize(sizeBytes: number | null): string {
  if (sizeBytes == null) {
    return "-";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface RecordingBrowserDialogProps {
  open: boolean;
  onClose: () => void;
  onPlay: (recordingId: string) => void;
}

export function RecordingBrowserDialog({
  open,
  onClose,
  onPlay,
}: RecordingBrowserDialogProps) {
  const [recordings, setRecordings] = useState<SessionRecordingRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!window.hypershell?.recordingList) {
      return;
    }
    setLoading(true);
    try {
      const list = await window.hypershell.recordingList();
      setRecordings(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void refresh();
  }, [open, refresh]);

  const handleDelete = async (recordingId: string) => {
    try {
      const response = await window.hypershell?.recordingDelete?.({ id: recordingId });
      if (!response?.deleted) {
        toast.error("Recording was not found");
        return;
      }
      toast.success("Recording deleted");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleExport = async (recording: SessionRecordingRecord) => {
    try {
      const destination = await window.hypershell?.fsShowSaveDialog?.({
        defaultPath: recording.fileName,
        filters: [{ name: "ASCIINEMA Cast", extensions: ["cast"] }],
      });
      if (!destination) {
        return;
      }
      const result = await window.hypershell?.recordingExport?.({
        id: recording.id,
        filePath: destination,
      });
      if (result?.filePath) {
        toast.success("Recording exported");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Session Recordings">
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Browse ASCIINEMA v2 recordings.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="bg-base-900/80 sticky top-0">
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Started</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((recording) => (
                <tr key={recording.id} className="border-t border-border/70">
                  <td className="px-3 py-2 text-text-primary">{recording.title}</td>
                  <td className="px-3 py-2 text-text-muted">{formatDate(recording.startedAt)}</td>
                  <td className="px-3 py-2 text-text-muted">{formatDuration(recording.durationMs)}</td>
                  <td className="px-3 py-2 text-text-muted">{formatSize(recording.fileSizeBytes)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onPlay(recording.id)}
                        className="rounded px-2 py-1 text-text-muted hover:text-text-primary hover:bg-base-700/50 transition-colors"
                      >
                        Play
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExport(recording)}
                        className="rounded px-2 py-1 text-text-muted hover:text-text-primary hover:bg-base-700/50 transition-colors"
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(recording.id)}
                        className="rounded px-2 py-1 text-danger/80 hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && recordings.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                    No recordings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
