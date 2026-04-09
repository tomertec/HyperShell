import { useStore } from "zustand";

import { transferStore } from "../transferStore";
import { formatFileSize } from "../utils/fileUtils";

function percentage(bytesTransferred: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (bytesTransferred / totalBytes) * 100));
}

export function TransferPanel() {
  const transfers = useStore(transferStore, (state) => state.transfers);
  const activeCount = useStore(transferStore, (state) => state.activeCount);
  const panelOpen = useStore(transferStore, (state) => state.panelOpen);
  const filter = useStore(transferStore, (state) => state.filter);
  const setFilter = useStore(transferStore, (state) => state.setFilter);
  const setPanelOpen = useStore(transferStore, (state) => state.setPanelOpen);

  const filteredTransfers =
    filter === "all"
      ? transfers
      : filter === "active"
        ? transfers.filter(
            (transfer) =>
              transfer.status === "queued" ||
              transfer.status === "active" ||
              transfer.status === "paused"
          )
        : transfers.filter((transfer) => transfer.status === filter);

  if (!panelOpen) {
    return activeCount > 0 ? (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-2 border-t border-base-700 bg-base-900 px-3 py-1 text-sm text-text-secondary hover:text-text-primary"
      >
        Transfers ({activeCount} active)
      </button>
    ) : null;
  }

  return (
    <div className="flex max-h-[260px] flex-col border-t border-base-700 bg-base-900">
      <div className="flex items-center justify-between border-b border-base-700 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">Transfers</span>
          <div className="flex gap-1 text-xs">
            {(["all", "active", "completed", "failed"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded px-2 py-0.5 ${
                  filter === option
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="text-sm text-text-secondary hover:text-text-primary"
          title="Close transfer panel"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {filteredTransfers.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-text-secondary">No transfers</div>
        ) : (
          filteredTransfers.map((transfer) => (
            <div
              key={transfer.transferId}
              className="flex items-center gap-3 border-b border-base-800 px-3 py-1.5 text-sm"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  transfer.status === "active"
                    ? "bg-blue-400"
                    : transfer.status === "completed"
                      ? "bg-green-400"
                      : transfer.status === "failed"
                        ? "bg-red-400"
                        : "bg-yellow-400"
                }`}
              />

              <span className="w-6 shrink-0 text-xs text-text-secondary">
                {transfer.type === "upload" ? "UP" : "DN"}
              </span>

              <span className="flex-1 truncate text-text-primary" title={transfer.remotePath}>
                {transfer.remotePath.split("/").pop() || transfer.remotePath}
              </span>

              {transfer.status === "active" && (
                <>
                  <span className="text-xs text-text-secondary">
                    {formatFileSize(transfer.speed)}/s
                  </span>
                  <div className="h-1.5 w-24 overflow-hidden rounded bg-base-700">
                    <div
                      className="h-full rounded bg-accent transition-all"
                      style={{
                        width: `${percentage(
                          transfer.bytesTransferred,
                          transfer.totalBytes
                        )}%`
                      }}
                    />
                  </div>
                </>
              )}

              <span className="w-20 text-right text-xs text-text-secondary">
                {formatFileSize(transfer.bytesTransferred)} / {formatFileSize(transfer.totalBytes)}
              </span>

              {(transfer.status === "active" || transfer.status === "queued") && (
                <button
                  type="button"
                  className="text-xs text-text-secondary hover:text-red-400"
                  onClick={() =>
                    window.hypershell?.sftpTransferCancel?.({
                      transferId: transfer.transferId
                    })
                  }
                >
                  Cancel
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
