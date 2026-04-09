import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { BackupInfo } from "@hypershell/shared";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function BackupRestorePanel() {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);

  const refreshBackups = useCallback(async () => {
    try {
      const result = await window.hypershell?.backupList?.();
      if (result) {
        setBackups(result.backups);
      }
    } catch (err) {
      console.warn("Failed to list backups:", err);
    }
  }, []);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  const handleCreateBackup = async () => {
    try {
      const now = new Date();
      const ts = now.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
      const defaultName = `hypershell-backup-${ts}.db`;

      const filePath = await window.hypershell?.fsShowSaveDialog?.({
        defaultPath: defaultName,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });

      if (!filePath) return;

      setLoading(true);
      const result = await window.hypershell?.backupCreate?.({ filePath });
      if (result) {
        toast.success(`Backup created (${formatFileSize(result.size)})`);
        void refreshBackups();
      }
    } catch (err) {
      toast.error(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (filePath?: string) => {
    try {
      let selectedPath = filePath;

      if (!selectedPath) {
        selectedPath = (await window.hypershell?.backupShowOpenDialog?.()) ?? undefined;
        if (!selectedPath) return;
      }

      const confirmed = window.confirm(
        "Restoring a backup will replace your current database. The app will need to restart. Continue?"
      );
      if (!confirmed) return;

      setLoading(true);
      const result = await window.hypershell?.backupRestore?.({ filePath: selectedPath });
      if (result?.requiresRestart) {
        setRestartRequired(true);
        toast.success("Database restored. Please restart the application.");
      }
    } catch (err) {
      toast.error(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
      {restartRequired && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          Database restored successfully. Please restart the application for changes to take effect.
        </div>
      )}

      {/* Actions */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Database Backup
        </h3>
        <div className="grid gap-3">
          <button
            onClick={() => void handleCreateBackup()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface/80 px-4 py-2.5 text-sm text-text-primary hover:bg-surface hover:border-border-bright transition-all duration-150 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v8m0 0l-3-3m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Create Backup
          </button>
          <button
            onClick={() => void handleRestore()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface/80 px-4 py-2.5 text-sm text-text-primary hover:bg-surface hover:border-border-bright transition-all duration-150 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 14V6m0 0l3 3m-3-3l-3 3M3 4V3a1 1 0 011-1h8a1 1 0 011 1v1"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Restore from Backup
          </button>
        </div>
      </div>

      {/* Recent backups */}
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Auto-Backups
        </h3>
        {backups.length === 0 ? (
          <p className="text-xs text-text-muted">No auto-backups found.</p>
        ) : (
          <div className="grid gap-1.5">
            {backups.map((backup, i) => (
              <div
                key={backup.filePath}
                className="flex items-center justify-between rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-text-primary truncate">{backup.fileName}</div>
                  <div className="text-text-muted">
                    {formatDate(backup.createdAt)} &middot; {formatFileSize(backup.size)}
                    {i === 0 && (
                      <span className="ml-2 text-accent font-medium">Latest</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void handleRestore(backup.filePath)}
                  disabled={loading}
                  className="ml-2 shrink-0 rounded px-2 py-1 text-text-muted hover:text-text-primary hover:bg-base-700/50 transition-colors disabled:opacity-50"
                  title="Restore this backup"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
