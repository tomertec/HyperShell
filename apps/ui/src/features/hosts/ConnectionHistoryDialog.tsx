import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConnectionHistoryRecord } from "@hypershell/shared";

import type { HostRecord } from "./HostsView";
import { Modal } from "../layout/Modal";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatDuration(record: ConnectionHistoryRecord): string {
  if (!record.wasSuccessful) {
    return "-";
  }
  if (!record.disconnectedAt) {
    return "Active";
  }

  const start = new Date(record.connectedAt).getTime();
  const end = new Date(record.disconnectedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return "-";
  }

  const totalSeconds = Math.floor((end - start) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export interface ConnectionHistoryDialogProps {
  open: boolean;
  host: HostRecord | null;
  onClose: () => void;
}

export function ConnectionHistoryDialog({
  open,
  host,
  onClose,
}: ConnectionHistoryDialogProps) {
  const [rows, setRows] = useState<ConnectionHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!host?.id || !window.hypershell?.connectionHistoryListByHost) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await window.hypershell.connectionHistoryListByHost({
        hostId: host.id,
        limit: 200,
      });
      setRows(data);
    } catch (err) {
      setRows([]);
      setError(
        err instanceof Error ? err.message : "Failed to load connection history."
      );
    } finally {
      setLoading(false);
    }
  }, [host?.id]);

  useEffect(() => {
    if (!open || !host) {
      return;
    }
    void refresh();
  }, [open, host, refresh]);

  const summary = useMemo(() => {
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.wasSuccessful) {
        success += 1;
      } else {
        failed += 1;
      }
    }
    return { success, failed };
  }, [rows]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={host ? `Connection History: ${host.name}` : "Connection History"}
    >
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Success: {summary.success} · Failed: {summary.failed}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || !host}
            className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        <div className="max-h-[52vh] overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-base-900/80">
              <tr className="text-left text-text-muted">
                <th className="px-3 py-2 font-medium">Host</th>
                <th className="px-3 py-2 font-medium">Connected</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border/70">
                  <td className="px-3 py-2 text-text-primary">
                    {row.hostName ?? host?.name ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {formatDateTime(row.connectedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {row.wasSuccessful ? (
                      <span className="text-success">Success</span>
                    ) : (
                      <span className="text-danger">Failed</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {formatDuration(row)}
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {row.errorMessage ?? "-"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !error ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-text-muted">
                    No connection history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
