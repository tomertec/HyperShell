import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { BackupInfo } from "@hypershell/shared";
import { Button } from "../../components/ui/Button";
import { SectionLabel } from "../../components/ui/SectionLabel";
import { getShell } from "../../lib/shell";

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
      const result = await getShell().backupList();
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

      const filePath = await getShell().fsShowSaveDialog({
        defaultPath: defaultName,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });

      if (!filePath) return;

      setLoading(true);
      const result = await getShell().backupCreate({ filePath });
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
        selectedPath = (await getShell().backupShowOpenDialog()) ?? undefined;
        if (!selectedPath) return;
      }

      const confirmed = window.confirm(
        "Restoring a backup will replace your current database. The app will need to restart. Continue?"
      );
      if (!confirmed) return;

      setLoading(true);
      const result = await getShell().backupRestore({ filePath: selectedPath });
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
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Database restored successfully. Please restart the application for changes to take effect.
        </div>
      )}

      {/* Actions */}
      <div>
        <SectionLabel className="mb-3">Database Backup</SectionLabel>
        <div className="grid gap-3">
          <Button
            variant="outline"
            onClick={() => void handleCreateBackup()}
            disabled={loading}
            className="w-full"
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
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleRestore()}
            disabled={loading}
            className="w-full"
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
          </Button>
        </div>
      </div>

      {/* Recent backups */}
      <div>
        <SectionLabel className="mb-3">Auto-Backups</SectionLabel>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRestore(backup.filePath)}
                  disabled={loading}
                  className="ml-2 shrink-0"
                  title="Restore this backup"
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
