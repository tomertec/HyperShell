import { createStore, type StoreApi } from "zustand/vanilla";

import type { TransferJob } from "@hypershell/shared";

export type TransferFilter = "all" | "active" | "completed" | "failed";

export interface TransferStoreState {
  transfers: TransferJob[];
  activeCount: number;
  panelOpen: boolean;
  filter: TransferFilter;
  setTransfers: (transfers: TransferJob[]) => void;
  updateTransfer: (transferId: string, update: Partial<TransferJob>) => void;
  setFilter: (filter: TransferFilter) => void;
  setPanelOpen: (open: boolean) => void;
}

function deriveActiveCount(transfers: TransferJob[]): number {
  return transfers.filter((transfer) => transfer.status === "active").length;
}

function shouldOpenPanel(transfers: TransferJob[]): boolean {
  return transfers.some(
    (transfer) => transfer.status === "queued" || transfer.status === "active"
  );
}

export function createTransferStore(): StoreApi<TransferStoreState> {
  return createStore<TransferStoreState>()((set) => ({
    transfers: [],
    activeCount: 0,
    panelOpen: false,
    filter: "all",

    setTransfers: (transfers) =>
      set({
        transfers: [...transfers],
        activeCount: deriveActiveCount(transfers),
        panelOpen: shouldOpenPanel(transfers)
      }),

    updateTransfer: (transferId, update) =>
      set((state) => {
        const transfers = state.transfers.map((transfer) =>
          transfer.transferId === transferId
            ? { ...transfer, ...update }
            : transfer
        );

        return {
          transfers,
          activeCount: deriveActiveCount(transfers),
          panelOpen: state.panelOpen || shouldOpenPanel(transfers)
        };
      }),

    setFilter: (filter) => set({ filter }),
    setPanelOpen: (panelOpen) => set({ panelOpen })
  }));
}

export const transferStore = createTransferStore();
