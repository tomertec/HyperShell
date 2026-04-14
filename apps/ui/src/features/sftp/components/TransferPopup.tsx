import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useStore } from "zustand";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { TransferJobStatus } from "@hypershell/shared";
import { settingsStore } from "../../settings/settingsStore";
import { transferStore, type TransferStoreTransfer } from "../transferStore";
import { toErrorMessage } from "../utils/errorUtils";
import { formatFileSize } from "../utils/fileUtils";

const RECENT_TRANSFER_WINDOW_MS = 120000;
const MAX_VISIBLE_TRANSFERS = 1;
const DRAG_MARGIN_PX = 8;
const AUTO_MINIMIZE_IDLE_MS = 120000;

interface DragSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
  minOffsetX: number;
  maxOffsetX: number;
  minOffsetY: number;
  maxOffsetY: number;
}

function isRunningStatus(status: TransferJobStatus): boolean {
  return status === "queued" || status === "active" || status === "paused" || status === "interrupted";
}

function percentage(bytesTransferred: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (bytesTransferred / totalBytes) * 100));
}

function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "Calculating...";
  }

  return `${formatFileSize(bytesPerSecond)}/s`;
}

function formatEta(transfer: TransferStoreTransfer): string | null {
  if (transfer.totalBytes <= 0 || transfer.speed <= 0) {
    return null;
  }

  const remainingSeconds = Math.ceil(
    Math.max(0, transfer.totalBytes - transfer.bytesTransferred) / transfer.speed
  );
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) {
    return "Almost done";
  }

  if (remainingSeconds < 60) {
    return `${remainingSeconds}s left`;
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return seconds === 0 ? `${minutes}m left` : `${minutes}m ${seconds}s left`;
}

function getTransferName(transfer: TransferStoreTransfer): string {
  const preferredPath = transfer.type === "upload" ? transfer.localPath : transfer.remotePath;
  const segments = preferredPath.split(/[\\/]/);
  return segments[segments.length - 1] || preferredPath;
}

function getTransferCaption(transfer: TransferStoreTransfer): string {
  if (transfer.status === "queued") {
    return transfer.type === "upload" ? "Waiting to upload" : "Waiting to download";
  }

  if (transfer.status === "paused") {
    return isPausedByUser(transfer) ? "Paused by user" : "Waiting for conflict resolution";
  }

  if (transfer.status === "interrupted") {
    return "Connection lost — resume available";
  }

  if (transfer.status === "failed") {
    return transfer.error?.trim() || "Transfer failed";
  }

  if (transfer.status === "completed") {
    return transfer.type === "upload" ? "Upload finished" : "Download finished";
  }

  return transfer.type === "upload" ? "Uploading" : "Downloading";
}

function sortTransfers(left: TransferStoreTransfer, right: TransferStoreTransfer): number {
  const leftRunning = isRunningStatus(left.status);
  const rightRunning = isRunningStatus(right.status);

  if (leftRunning !== rightRunning) {
    return leftRunning ? -1 : 1;
  }

  return right.updatedAt - left.updatedAt;
}

function isCancelledByUser(transfer: TransferStoreTransfer): boolean {
  return transfer.status === "failed"
    && (transfer.error ?? "").toLowerCase().includes("cancelled by user");
}

function isPausedByUser(transfer: TransferStoreTransfer): boolean {
  return transfer.status === "paused"
    && (transfer.error ?? "").toLowerCase().includes("paused by user");
}

function TransferGlyph({
  type,
  running
}: {
  type: TransferStoreTransfer["type"];
  running: boolean;
}) {
  return (
    <div
      className="relative flex h-7 w-7 items-center justify-center rounded-lg border border-accent/30 bg-sky-500/10 text-sky-200"
    >
      {running ? (
        <motion.span
          className="absolute inset-0 rounded-lg bg-accent/8"
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
        />
      ) : null}
      <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className="relative z-10">
        {type === "upload" ? (
          <>
            <path d="M9 13.75V4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path
              d="M5.75 7.5L9 4.25L12.25 7.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : (
          <>
            <path d="M9 4.25V13.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path
              d="M5.75 10.5L9 13.75L12.25 10.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
    </div>
  );
}

function TransferRow({
  transfer,
  cancelling,
  pausing,
  resuming,
  retrying,
  hasConflict,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onResolveConflict
}: {
  transfer: TransferStoreTransfer;
  cancelling: boolean;
  pausing: boolean;
  resuming: boolean;
  retrying: boolean;
  hasConflict: boolean;
  onCancel: (transferId: string) => Promise<void>;
  onPause: (transferId: string) => Promise<void>;
  onResume: (transferId: string) => Promise<void>;
  onRetry: (transferId: string) => Promise<void>;
  onResolveConflict: (transferId: string, resolution: "overwrite" | "skip" | "rename", applyToAll: boolean) => void;
}) {
  const running = isRunningStatus(transfer.status);
  const pausedByUser = isPausedByUser(transfer);
  const progress = percentage(transfer.bytesTransferred, transfer.totalBytes);
  const eta = formatEta(transfer);
  const progressLabel =
    transfer.totalBytes > 0
      ? `${formatFileSize(transfer.bytesTransferred)} of ${formatFileSize(transfer.totalBytes)}`
      : formatFileSize(transfer.bytesTransferred);

  return (
    <div className="rounded-xl border border-accent/8 bg-sky-950/20 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <TransferGlyph type={transfer.type} running={running} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-medium text-text-primary">{getTransferName(transfer)}</p>
            <span
              className={[
                "rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider",
                transfer.status === "completed"
                  ? "bg-sky-500/15 text-sky-200"
                  : transfer.status === "failed"
                    ? "bg-red-500/15 text-red-200"
                    : transfer.status === "interrupted"
                      ? "bg-yellow-500/15 text-yellow-200"
                      : transfer.status === "paused"
                        ? "bg-amber-500/15 text-amber-100"
                        : "bg-accent/10 text-sky-300/80"
              ].join(" ")}
            >
              {hasConflict ? "conflict" : transfer.status}
            </span>
          </div>

          <p className="mt-0.5 truncate text-[10px] text-text-secondary">{getTransferCaption(transfer)}</p>

          {hasConflict ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-amber-200/70">File exists:</span>
              <button
                type="button"
                className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100"
                onClick={() => onResolveConflict(transfer.transferId, "overwrite", false)}
              >
                Overwrite
              </button>
              <button
                type="button"
                className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100"
                onClick={() => onResolveConflict(transfer.transferId, "skip", false)}
              >
                Skip
              </button>
              <button
                type="button"
                className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100"
                onClick={() => onResolveConflict(transfer.transferId, "rename", false)}
              >
                Rename
              </button>
              <span className="mx-0.5 text-[9px] text-text-secondary/50">|</span>
              <button
                type="button"
                className="rounded border border-amber-400/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-200/70 transition-colors hover:border-amber-400/30 hover:text-amber-100"
                onClick={() => onResolveConflict(transfer.transferId, "overwrite", true)}
              >
                Overwrite all
              </button>
              <button
                type="button"
                className="rounded border border-amber-400/20 bg-amber-500/8 px-2 py-0.5 text-[10px] text-amber-200/70 transition-colors hover:border-amber-400/30 hover:text-amber-100"
                onClick={() => onResolveConflict(transfer.transferId, "skip", true)}
              >
                Skip all
              </button>
            </div>
          ) : (
          <div className="mt-1.5">
            <div className="mb-1 flex items-center justify-between text-[10px] text-text-secondary">
              <span>{progressLabel}</span>
              <span>{running ? formatRate(transfer.speed) : transfer.status === "completed" ? "Done" : "Stopped"}</span>
            </div>

            <div className="relative h-1.5 overflow-hidden rounded-full bg-accent-glow">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,var(--color-accent-dim),var(--color-accent))]"
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: "spring", stiffness: 130, damping: 24, mass: 0.5 }}
              />
              {running ? (
                <motion.div
                  className="absolute inset-y-0 left-0 w-12 rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)]"
                  animate={{ x: ["-20%", "220%"] }}
                  transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                />
              ) : null}
            </div>

            <div className="mt-1 flex items-center justify-between text-[10px] text-text-secondary">
              <span>{transfer.totalBytes > 0 ? `${Math.round(progress)}%` : "Preparing"}</span>
              <span>{eta ?? (transfer.status === "active" ? "Transferring" : " ")}</span>
            </div>
          </div>
          )}
        </div>

        {!hasConflict && (transfer.status === "active" || transfer.status === "queued" || transfer.status === "paused") ? (
          <div className="flex flex-col gap-1">
            {(transfer.status === "active" || transfer.status === "queued") ? (
              <button
                type="button"
                disabled={pausing || resuming || cancelling}
                className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  void onPause(transfer.transferId);
                }}
              >
                {pausing ? "..." : "Pause"}
              </button>
            ) : null}
            {transfer.status === "paused" && pausedByUser ? (
              <button
                type="button"
                disabled={resuming || pausing || cancelling}
                className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-sky-200/70 transition-colors hover:border-accent/30 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  void onResume(transfer.transferId);
                }}
              >
                {resuming ? "..." : "Resume"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={cancelling || pausing || resuming}
              className="rounded border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-text-secondary transition-colors hover:border-red-400/25 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                void onCancel(transfer.transferId);
              }}
            >
              {cancelling ? "..." : "Cancel"}
            </button>
          </div>
        ) : null}

        {(transfer.status === "interrupted" || transfer.status === "failed") && transfer.bytesTransferred > 0 ? (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              disabled={retrying}
              className="rounded border border-accent/15 bg-sky-500/8 px-2 py-0.5 text-[10px] text-blue-300/70 transition-colors hover:border-blue-400/30 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                void onRetry(transfer.transferId);
              }}
            >
              {retrying ? "..." : "Resume"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TransferPopup() {
  const usePopupTransferMonitor = useStore(
    settingsStore,
    (state) => state.settings.general.usePopupTransferMonitor
  );
  const autoHideCompletedTransfers = useStore(
    settingsStore,
    (state) => state.settings.general.autoHideCompletedTransfers
  );
  const transfers = useStore(transferStore, (state) => state.transfers);
  const activeCount = useStore(transferStore, (state) => state.activeCount);
  const panelOpen = useStore(transferStore, (state) => state.panelOpen);
  const setPanelOpen = useStore(transferStore, (state) => state.setPanelOpen);
  const [now, setNow] = useState(() => Date.now());
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [pendingOps, setPendingOps] = useState<Map<string, "cancel" | "pause" | "resume" | "retry">>(() => new Map());
  const [conflictIds, setConflictIds] = useState<Set<string>>(() => new Set());
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const popupContainerRef = useRef<HTMLDivElement | null>(null);

  const refreshTransfers = useCallback(async () => {
    try {
      const response = await window.hypershell?.sftpTransferList?.();
      if (!response) {
        return;
      }

      transferStore.getState().setTransfers(response.transfers);
    } catch {
      // Ignore polling failures and wait for the next cycle.
    }
  }, []);

  useEffect(() => {
    void refreshTransfers();
  }, [refreshTransfers]);

  useEffect(() => {
    const unsubscribe = window.hypershell?.onSftpEvent?.((event) => {
      const hasTransfer = transferStore
        .getState()
        .transfers.some((transfer) => transfer.transferId === event.transferId);

      if (event.kind === "transfer-progress") {
        if (!hasTransfer) {
          void refreshTransfers();
          return;
        }

        transferStore.getState().updateTransfer(event.transferId, {
          bytesTransferred: event.bytesTransferred,
          totalBytes: event.totalBytes,
          speed: event.speed,
          status: event.status
        });
        return;
      }

      if (event.kind === "transfer-conflict") {
        setConflictIds((prev) => new Set(prev).add(event.transferId));
        transferStore.getState().setPanelOpen(true);
        void refreshTransfers();
        return;
      }

      if (event.kind === "transfer-complete") {
        setConflictIds((prev) => {
          if (!prev.has(event.transferId)) return prev;
          const next = new Set(prev);
          next.delete(event.transferId);
          return next;
        });
        if (hasTransfer) {
          transferStore.getState().updateTransfer(event.transferId, {
            status: event.status,
            error: event.error
          });
        }
        // Directory parent jobs can complete before child jobs are known to the UI.
        // Refreshing here pulls newly enqueued child jobs immediately.
        void refreshTransfers();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [refreshTransfers]);

  const { runningTransfers, queuedTransfers, pausedTransfers, recentTransfers } = useMemo(() => {
    const running: TransferStoreTransfer[] = [];
    const queued: TransferStoreTransfer[] = [];
    const paused: TransferStoreTransfer[] = [];
    const recent: TransferStoreTransfer[] = [];

    for (const transfer of transfers) {
      const isRunning = isRunningStatus(transfer.status);
      if (isRunning) {
        running.push(transfer);
        if (transfer.status === "queued") { queued.push(transfer); }
        if (transfer.status === "paused") { paused.push(transfer); }
        recent.push(transfer);
      } else if (
        !isCancelledByUser(transfer)
        && transfer.completedAt != null
        && now - transfer.completedAt < RECENT_TRANSFER_WINDOW_MS
      ) {
        recent.push(transfer);
      }
    }

    recent.sort(sortTransfers);
    return { runningTransfers: running, queuedTransfers: queued, pausedTransfers: paused, recentTransfers: recent };
  }, [now, transfers]);

  useEffect(() => {
    if (!usePopupTransferMonitor) {
      return;
    }

    if (!panelOpen && runningTransfers.length === 0 && recentTransfers.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshTransfers();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [panelOpen, recentTransfers.length, refreshTransfers, runningTransfers.length, usePopupTransferMonitor]);

  useEffect(() => {
    if (recentTransfers.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [recentTransfers.length]);

  useEffect(() => {
    if (!usePopupTransferMonitor || runningTransfers.length > 0 || recentTransfers.length === 0 || !panelOpen) {
      return;
    }

    if (autoHideCompletedTransfers) {
      setPanelOpen(false);
      return;
    }

    const elapsed = Date.now() - lastInteractionAt;
    const remaining = Math.max(0, AUTO_MINIMIZE_IDLE_MS - elapsed);
    const timeout = window.setTimeout(() => {
      setPanelOpen(false);
    }, remaining);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    autoHideCompletedTransfers,
    lastInteractionAt,
    panelOpen,
    recentTransfers.length,
    runningTransfers.length,
    setPanelOpen,
    usePopupTransferMonitor
  ]);

  useEffect(() => {
    if (runningTransfers.length === 0 && recentTransfers.length > 0) {
      setLastInteractionAt(Date.now());
    }
  }, [recentTransfers.length, runningTransfers.length]);

  useEffect(() => {
    if (!dragSession) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragSession.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragSession.startClientX;
      const deltaY = event.clientY - dragSession.startClientY;
      const nextOffsetX = dragSession.startOffsetX + deltaX;
      const nextOffsetY = dragSession.startOffsetY + deltaY;

      setDragOffset({
        x: Math.max(dragSession.minOffsetX, Math.min(dragSession.maxOffsetX, nextOffsetX)),
        y: Math.max(dragSession.minOffsetY, Math.min(dragSession.maxOffsetY, nextOffsetY))
      });
    };

    const stopDragging = (event: PointerEvent) => {
      if (event.pointerId !== dragSession.pointerId) {
        return;
      }

      setDragSession(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [dragSession]);

  const startPopupDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, input, textarea, select, a")) {
      return;
    }

    const rect = popupContainerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    event.preventDefault();
    setLastInteractionAt(Date.now());
    const minOffsetX = dragOffset.x + DRAG_MARGIN_PX - rect.left;
    const maxOffsetX = dragOffset.x + window.innerWidth - DRAG_MARGIN_PX - rect.right;
    const minOffsetY = dragOffset.y + DRAG_MARGIN_PX - rect.top;
    const maxOffsetY = dragOffset.y + window.innerHeight - DRAG_MARGIN_PX - rect.bottom;

    setDragSession({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: dragOffset.x,
      startOffsetY: dragOffset.y,
      minOffsetX,
      maxOffsetX,
      minOffsetY,
      maxOffsetY
    });
  }, [dragOffset.x, dragOffset.y]);

  const markInteraction = useCallback(() => {
    setLastInteractionAt(Date.now());
  }, []);

  const cancelTransfer = useCallback(async (transferId: string) => {
    const cancel = window.hypershell?.sftpTransferCancel;
    if (!cancel) {
      toast.error("Cancel transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    setPendingOps((current) => new Map(current).set(transferId, "cancel"));

    try {
      await cancel({ transferId });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to cancel transfer"));
    } finally {
      setPendingOps((current) => { const next = new Map(current); next.delete(transferId); return next; });
      void refreshTransfers();
    }
  }, [refreshTransfers]);

  const pauseTransfer = useCallback(async (transferId: string) => {
    const pause = window.hypershell?.sftpTransferPause;
    if (!pause) {
      toast.error("Pause transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    setPendingOps((current) => new Map(current).set(transferId, "pause"));

    try {
      await pause({ transferId });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to pause transfer"));
    } finally {
      setPendingOps((current) => { const next = new Map(current); next.delete(transferId); return next; });
      void refreshTransfers();
    }
  }, [refreshTransfers]);

  const resumeTransfer = useCallback(async (transferId: string) => {
    const resume = window.hypershell?.sftpTransferResume;
    if (!resume) {
      toast.error("Resume transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    setPendingOps((current) => new Map(current).set(transferId, "resume"));

    try {
      await resume({ transferId });
    } catch (error) {
      toast.error(toErrorMessage(error, "Failed to resume transfer"));
    } finally {
      setPendingOps((current) => { const next = new Map(current); next.delete(transferId); return next; });
      void refreshTransfers();
    }
  }, [refreshTransfers]);

  const retryTransfer = useCallback(async (transferId: string) => {
    setPendingOps((current) => new Map(current).set(transferId, "retry"));

    try {
      await window.hypershell?.sftpTransferRetry?.({ transferId });
      toast.success("Transfer resumed");
    } catch (err) {
      toast.error(`Resume failed: ${toErrorMessage(err)}`);
    } finally {
      setPendingOps((current) => { const next = new Map(current); next.delete(transferId); return next; });
      void refreshTransfers();
    }
  }, [refreshTransfers]);

  const resolveConflict = useCallback(
    (transferId: string, resolution: "overwrite" | "skip" | "rename", applyToAll: boolean) => {
      setConflictIds((prev) => {
        if (!prev.has(transferId)) return prev;
        const next = new Set(prev);
        next.delete(transferId);
        return next;
      });

      void (async () => {
        try {
          await window.hypershell?.sftpTransferResolveConflict?.({
            transferId,
            resolution,
            applyToAll
          });
        } catch (error) {
          toast.error(toErrorMessage(error, "Failed to resolve conflict"));
        } finally {
          void refreshTransfers();
        }
      })();
    },
    [refreshTransfers]
  );

  const cancelAllTransfers = useCallback(async () => {
    const cancel = window.hypershell?.sftpTransferCancel;
    if (!cancel) {
      toast.error("Cancel transfer is unavailable in this build. Restart HyperShell.");
      return;
    }

    const transferIds = transferStore
      .getState()
      .transfers
      .filter((transfer) => isRunningStatus(transfer.status))
      .map((transfer) => transfer.transferId);

    if (transferIds.length === 0) {
      return;
    }

    setPendingOps((current) => {
      const next = new Map(current);
      for (const id of transferIds) {
        next.set(id, "cancel");
      }
      return next;
    });

    let failedCancels = 0;
    for (const transferId of transferIds) {
      try {
        await cancel({ transferId });
      } catch {
        failedCancels += 1;
      }
    }

    if (failedCancels > 0) {
      toast.error(`Failed to cancel ${failedCancels} transfer${failedCancels === 1 ? "" : "s"}`);
    }

    setPendingOps((current) => {
      const next = new Map(current);
      for (const id of transferIds) {
        next.delete(id);
      }
      return next;
    });
    void refreshTransfers();
  }, [refreshTransfers]);

  const totalSpeed = useMemo(
    () =>
      runningTransfers.reduce((sum, transfer) => {
        if (!Number.isFinite(transfer.speed) || transfer.speed <= 0) {
          return sum;
        }

        return sum + transfer.speed;
      }, 0),
    [runningTransfers]
  );

  const shouldRenderPopup =
    usePopupTransferMonitor && (runningTransfers.length > 0 || recentTransfers.length > 0);

  if (!shouldRenderPopup || typeof document === "undefined") {
    return null;
  }

  const visibleTransfers = recentTransfers.slice(0, MAX_VISIBLE_TRANSFERS);

  const popup = (
    <div
      ref={popupContainerRef}
      className="pointer-events-none fixed bottom-20 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 sm:right-6"
      style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }}
    >
      <AnimatePresence initial={false}>
        {!panelOpen && runningTransfers.length > 0 ? (
          <motion.button
            key="transfer-chip"
            type="button"
            onClick={() => {
              setLastInteractionAt(Date.now());
              setPanelOpen(true);
            }}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-accent/20 bg-base-900/90 px-3 py-1.5 text-left shadow-xl backdrop-blur-xl"
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            <motion.span
              className="h-2 w-2 rounded-full bg-accent shadow-[0_0_14px_var(--color-accent-dim)]"
              animate={{ scale: [1, 1.25, 1], opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            />
            <span className="text-xs font-medium text-text-primary">
              {activeCount > 0 ? `${activeCount} active transfer${activeCount === 1 ? "" : "s"}` : "Open transfers"}
            </span>
            <span className="text-[10px] text-text-secondary">{formatRate(totalSpeed)}</span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {panelOpen ? (
          <motion.section
            key="transfer-popup"
            className="pointer-events-auto w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-accent/12 bg-base-900/97 text-text-primary shadow-2xl backdrop-blur-2xl"
            onPointerDown={markInteraction}
            onPointerEnter={markInteraction}
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="relative overflow-hidden border-b border-accent/8 px-3 py-2.5 cursor-move"
              onPointerDown={startPopupDrag}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-50"
                style={{
                  background:
                    "radial-gradient(circle at top left, var(--color-accent-dim), transparent 50%), radial-gradient(circle at top right, var(--color-accent-glow), transparent 40%)"
                }}
              />

              <div className="relative flex items-center justify-between gap-2 select-none">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <motion.span
                      className="h-2 w-2 rounded-full bg-accent shadow-[0_0_14px_var(--color-accent-dim)]"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                    />
                    <h3 className="text-xs font-semibold tracking-tight">SFTP Transfers</h3>
                  </div>
                  <p className="mt-0.5 text-[10px] text-text-secondary">
                    {runningTransfers.length > 0
                      ? `${activeCount} active, ${queuedTransfers.length} queued${pausedTransfers.length > 0 ? `, ${pausedTransfers.length} paused` : ""}, ${formatRate(totalSpeed)} combined`
                      : "Recent transfer activity"}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {runningTransfers.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        void cancelAllTransfers();
                      }}
                      className="rounded border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-text-secondary transition-colors hover:border-red-400/25 hover:text-red-300"
                    >
                      Cancel all
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    className="rounded border border-accent/12 bg-sky-500/6 px-2 py-0.5 text-[10px] text-sky-200/60 transition-colors hover:border-accent/25 hover:text-sky-100"
                  >
                    Minimize
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[320px] space-y-1.5 overflow-y-auto p-2.5">
              {visibleTransfers.map((transfer) => (
                <TransferRow
                  key={transfer.transferId}
                  transfer={transfer}
                  cancelling={pendingOps.get(transfer.transferId) === "cancel"}
                  pausing={pendingOps.get(transfer.transferId) === "pause"}
                  resuming={pendingOps.get(transfer.transferId) === "resume"}
                  retrying={pendingOps.get(transfer.transferId) === "retry"}
                  hasConflict={conflictIds.has(transfer.transferId)}
                  onCancel={cancelTransfer}
                  onPause={pauseTransfer}
                  onResume={resumeTransfer}
                  onRetry={retryTransfer}
                  onResolveConflict={resolveConflict}
                />
              ))}
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  );

  return createPortal(popup, document.body);
}
