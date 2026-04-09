import { useCallback, useEffect, useState } from "react";
import type { SftpSyncStatus, SftpSyncEvent } from "@hypershell/shared";

export interface SyncPanelProps {
  sftpSessionId: string;
  localPath: string;
  remotePath: string;
  onClose: () => void;
}

type SyncDirection = "local-to-remote" | "remote-to-local" | "bidirectional";

export function SyncPanel({ sftpSessionId, localPath, remotePath, onClose }: SyncPanelProps) {
  const [syncLocalPath, setSyncLocalPath] = useState(localPath);
  const [syncRemotePath, setSyncRemotePath] = useState(remotePath);
  const [direction, setDirection] = useState<SyncDirection>("local-to-remote");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [activeSyncId, setActiveSyncId] = useState<string | null>(null);
  const [syncs, setSyncs] = useState<SftpSyncStatus[]>([]);
  const [lastEvent, setLastEvent] = useState<SftpSyncEvent | null>(null);
  const [running, setRunning] = useState(false);

  const refreshSyncs = useCallback(async () => {
    try {
      const result = await window.hypershell?.sftpSyncList?.();
      if (result) {
        setSyncs(result.syncs);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshSyncs();
  }, [refreshSyncs]);

  useEffect(() => {
    const unsubscribe = window.hypershell?.onSftpSyncEvent?.((event) => {
      setLastEvent(event);
      if (event.kind === "sync-complete" || event.kind === "sync-error") {
        setRunning(false);
        void refreshSyncs();
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [refreshSyncs]);

  const handleStart = useCallback(async () => {
    if (!syncLocalPath || !syncRemotePath) return;
    setRunning(true);
    setLastEvent(null);
    try {
      const patterns = excludePatterns
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const result = await window.hypershell?.sftpSyncStart?.({
        sftpSessionId,
        localPath: syncLocalPath,
        remotePath: syncRemotePath,
        direction,
        excludePatterns: patterns,
        deleteOrphans: false,
      });
      if (result) {
        setActiveSyncId(result.syncId);
      }
      void refreshSyncs();
    } catch {
      setRunning(false);
    }
  }, [sftpSessionId, syncLocalPath, syncRemotePath, direction, excludePatterns, refreshSyncs]);

  const handleStop = useCallback(async () => {
    if (!activeSyncId) return;
    try {
      await window.hypershell?.sftpSyncStop?.({ syncId: activeSyncId });
      setActiveSyncId(null);
      setRunning(false);
      void refreshSyncs();
    } catch {
      // ignore
    }
  }, [activeSyncId, refreshSyncs]);

  const directionLabel = (d: SyncDirection) => {
    switch (d) {
      case "local-to-remote": return "Local -> Remote";
      case "remote-to-local": return "Remote -> Local";
      case "bidirectional": return "Bidirectional";
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-base-700 bg-base-900/90 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-primary">Sync</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:bg-base-700 hover:text-text-primary"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        <label className="py-0.5 text-text-secondary">Local</label>
        <input
          type="text"
          value={syncLocalPath}
          onChange={(e) => setSyncLocalPath(e.target.value)}
          className="rounded bg-base-800 px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border focus:border-accent/50"
          placeholder="Local directory path"
        />

        <label className="py-0.5 text-text-secondary">Remote</label>
        <input
          type="text"
          value={syncRemotePath}
          onChange={(e) => setSyncRemotePath(e.target.value)}
          className="rounded bg-base-800 px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border focus:border-accent/50"
          placeholder="Remote directory path"
        />

        <label className="py-0.5 text-text-secondary">Direction</label>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as SyncDirection)}
          className="rounded bg-base-800 px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border focus:border-accent/50"
        >
          <option value="local-to-remote">{directionLabel("local-to-remote")}</option>
          <option value="remote-to-local">{directionLabel("remote-to-local")}</option>
          <option value="bidirectional">{directionLabel("bidirectional")}</option>
        </select>

        <label className="py-0.5 text-text-secondary">Exclude</label>
        <input
          type="text"
          value={excludePatterns}
          onChange={(e) => setExcludePatterns(e.target.value)}
          className="rounded bg-base-800 px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border focus:border-accent/50"
          placeholder="node_modules, .git (comma-separated)"
        />
      </div>

      <div className="flex items-center gap-2">
        {!running ? (
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={!syncLocalPath || !syncRemotePath}
            className="rounded bg-accent/80 px-3 py-0.5 text-xs text-white transition-colors hover:bg-accent disabled:opacity-40"
          >
            Start Sync
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleStop()}
            className="rounded bg-red-500/80 px-3 py-0.5 text-xs text-white transition-colors hover:bg-red-500"
          >
            Stop Sync
          </button>
        )}

        {lastEvent && (
          <span className="text-[10px] text-text-muted">
            {lastEvent.kind === "sync-progress" && (
              <>Syncing: {lastEvent.currentFile} ({lastEvent.filesSynced} files)</>
            )}
            {lastEvent.kind === "sync-complete" && (
              <>Complete: {lastEvent.filesSynced} files, {(lastEvent.bytesTransferred / 1024).toFixed(1)} KB</>
            )}
            {lastEvent.kind === "sync-error" && (
              <span className="text-red-400">Error: {lastEvent.error}</span>
            )}
          </span>
        )}
      </div>

      {syncs.length > 0 && (
        <div className="text-[10px] text-text-muted">
          {syncs.map((s) => (
            <div key={s.syncId} className="flex items-center gap-2">
              <span className="font-mono">{s.syncId.slice(0, 12)}</span>
              <span className={
                s.status === "error" ? "text-red-400"
                : s.status === "syncing" ? "text-accent"
                : "text-text-secondary"
              }>
                {s.status}
              </span>
              <span>{s.filesSynced}/{s.filesScanned} files</span>
              {s.lastError && <span className="text-red-400">{s.lastError}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
