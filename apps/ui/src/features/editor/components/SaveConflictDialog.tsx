import { useEffect, useRef, useState } from "react";

export interface SaveAsOutcome {
  ok: boolean;
  error?: string;
}

export interface SaveConflictDialogProps {
  fileName: string;
  remotePath: string;
  onOverwrite: () => void;
  onReload: () => void;
  // Async so the caller can refuse a destination that already exists (see
  // EditorApp) and report why, without this component knowing about SFTP.
  onSaveAs: (newRemotePath: string) => Promise<SaveAsOutcome>;
  onCancel: () => void;
}

/**
 * Shown when the remote file changed between opening it and saving. Every
 * option here preserves one side of the divergence — none of them can lose
 * both.
 */
export function SaveConflictDialog({
  fileName,
  remotePath,
  onOverwrite,
  onReload,
  onSaveAs,
  onCancel
}: SaveConflictDialogProps) {
  const [saveAsPath, setSaveAsPath] = useState(`${remotePath}.new`);
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // The dialog owns keyboard handling while it's open — the editor's global
  // Ctrl+S/Ctrl+W handler steps aside whenever a conflict is set, so Escape
  // here is the only keyboard way out.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleSaveAsClick = async () => {
    setSaveAsError(null);
    setSaveAsBusy(true);
    const outcome = await onSaveAs(saveAsPath);
    if (!isMountedRef.current) return;
    setSaveAsBusy(false);
    if (!outcome.ok) {
      setSaveAsError(outcome.error ?? "Failed to save");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remote file changed"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-[min(520px,90vw)] rounded-lg border border-base-600 bg-base-900 p-4 text-text-primary">
        <h2 className="text-sm font-semibold">{fileName} changed on the server</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Someone or something modified this file after you opened it. Saving now would
          discard those changes.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs text-red-200"
            onClick={onOverwrite}
          >
            Overwrite
          </button>
          <button
            type="button"
            className="rounded border border-accent/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100"
            onClick={onReload}
          >
            Reload from server (discards your local changes)
          </button>
          <button
            type="button"
            className="rounded border border-base-600 px-3 py-1 text-xs text-text-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 border-t border-base-700 pt-3">
          <label className="text-xs text-text-secondary" htmlFor="save-as-path">
            Or save a copy as:
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="save-as-path"
              type="text"
              value={saveAsPath}
              onChange={(event) => {
                setSaveAsPath(event.target.value);
                setSaveAsError(null);
              }}
              className="flex-1 rounded bg-base-800 px-2 py-1 text-xs outline-none focus:border focus:border-accent/50"
            />
            <button
              type="button"
              className="rounded border border-accent/20 bg-sky-500/10 px-3 py-1 text-xs text-sky-100 disabled:opacity-50"
              disabled={saveAsBusy}
              onClick={() => void handleSaveAsClick()}
            >
              {saveAsBusy ? "Saving..." : "Save As"}
            </button>
          </div>
          {saveAsError && <p className="mt-1 text-xs text-red-400">{saveAsError}</p>}
        </div>
      </div>
    </div>
  );
}
