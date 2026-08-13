import { createStore, type StoreApi } from "zustand/vanilla";

import type { TransferJob } from "@hypershell/shared";

export type TransferFilter = "all" | "active" | "completed" | "failed" | "interrupted";

export interface TransferStoreTransfer extends TransferJob {
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
  lastProgressAt: number | null;
}

export interface TransferStoreState {
  transfers: TransferStoreTransfer[];
  activeCount: number;
  attentionCount: number;
  conflictIds: ReadonlySet<string>;
  panelOpen: boolean;
  filter: TransferFilter;
  setTransfers: (transfers: TransferJob[]) => void;
  updateTransfer: (transferId: string, update: Partial<TransferJob>) => void;
  setConflict: (transferId: string) => void;
  clearConflict: (transferId: string) => void;
  setFilter: (filter: TransferFilter) => void;
  setPanelOpen: (open: boolean) => void;
}

function deriveActiveCount(transfers: TransferJob[]): number {
  return transfers.filter((transfer) => transfer.status === "active").length;
}

function needsAttention(transfer: TransferJob): boolean {
  return (
    transfer.status === "queued"
    || transfer.status === "active"
    || transfer.status === "paused"
    || transfer.status === "interrupted"
  );
}

function deriveAttentionCount(transfers: TransferJob[]): number {
  return transfers.filter(needsAttention).length;
}

function hasRunningTransfers(transfers: TransferJob[]): boolean {
  return transfers.some(needsAttention);
}

function hydrateTransfer(
  transfer: TransferJob,
  previous?: TransferStoreTransfer,
  now = Date.now()
): TransferStoreTransfer {
  const isRunning =
    transfer.status === "queued" || transfer.status === "active" || transfer.status === "paused";
  const hasProgress =
    transfer.bytesTransferred > 0 || transfer.totalBytes > 0 || transfer.speed > 0;
  const progressChanged =
    previous == null
      || previous.bytesTransferred !== transfer.bytesTransferred
      || previous.totalBytes !== transfer.totalBytes
      || previous.speed !== transfer.speed
      || previous.status !== transfer.status;

  return {
    ...transfer,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    startedAt:
      previous?.startedAt
      ?? (isRunning || transfer.status === "completed" || transfer.status === "failed" || hasProgress
        ? now
        : null),
    completedAt:
      transfer.status === "completed" || transfer.status === "failed"
        ? previous?.completedAt ?? now
        : null,
    lastProgressAt: progressChanged ? now : previous?.lastProgressAt ?? null
  };
}

export function createTransferStore(): StoreApi<TransferStoreState> {
  return createStore<TransferStoreState>()((set) => ({
    transfers: [],
    activeCount: 0,
    attentionCount: 0,
    conflictIds: new Set<string>(),
    panelOpen: false,
    filter: "all",

    setTransfers: (transfers) =>
      set((state) => {
        const now = Date.now();
        const previousById = new Map(
          state.transfers.map((transfer) => [transfer.transferId, transfer])
        );
        const nextTransfers = transfers.map((transfer) =>
          hydrateTransfer(transfer, previousById.get(transfer.transferId), now)
        );
        const nextHasRunningTransfers = hasRunningTransfers(nextTransfers);
        const previousHadRunningTransfers = hasRunningTransfers(state.transfers);

        return {
          transfers: nextTransfers,
          activeCount: deriveActiveCount(nextTransfers),
          attentionCount: deriveAttentionCount(nextTransfers),
          panelOpen: state.panelOpen || (!previousHadRunningTransfers && nextHasRunningTransfers)
        };
      }),

    updateTransfer: (transferId, update) =>
      set((state) => {
        const now = Date.now();
        const transfers = state.transfers.map((transfer) =>
          transfer.transferId === transferId
            ? hydrateTransfer({ ...transfer, ...update }, transfer, now)
            : transfer
        );
        const nextHasRunningTransfers = hasRunningTransfers(transfers);
        const previousHadRunningTransfers = hasRunningTransfers(state.transfers);

        return {
          transfers,
          activeCount: deriveActiveCount(transfers),
          attentionCount: deriveAttentionCount(transfers),
          panelOpen: state.panelOpen || (!previousHadRunningTransfers && nextHasRunningTransfers)
        };
      }),

    setConflict: (transferId) =>
      set((state) => {
        if (state.conflictIds.has(transferId)) {
          return {};
        }
        const next = new Set(state.conflictIds);
        next.add(transferId);
        return { conflictIds: next };
      }),

    clearConflict: (transferId) =>
      set((state) => {
        if (!state.conflictIds.has(transferId)) {
          return {};
        }
        const next = new Set(state.conflictIds);
        next.delete(transferId);
        return { conflictIds: next };
      }),

    setFilter: (filter) => set({ filter }),
    setPanelOpen: (panelOpen) => set({ panelOpen })
  }));
}

export const transferStore = createTransferStore();
