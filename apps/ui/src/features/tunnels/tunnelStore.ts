import { create } from "zustand";

interface ActiveForward {
  id: string;
  hostname?: string;
  protocol?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  status: "active" | "stopped";
}

interface TunnelState {
  activeForwards: ActiveForward[];
  selectedForwardId: string | null;
  showPanel: boolean;

  refresh: () => Promise<void>;
  selectForward: (id: string | null) => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
}

export const useTunnelStore = create<TunnelState>((set) => ({
  activeForwards: [],
  selectedForwardId: null,
  showPanel: false,

  async refresh() {
    try {
      const result = await window.hypershell?.listPortForwards?.();
      if (result) {
        set({
          activeForwards: result.map((f: { id: string; hostname?: string; protocol?: string; localPort?: number; remoteHost?: string; remotePort?: number }) => ({
            status: "active" as const,
            ...f,
          })),
        });
      }
    } catch { /* ignore */ }
  },

  selectForward(id) {
    set({ selectedForwardId: id });
  },

  togglePanel() {
    set((s) => ({ showPanel: !s.showPanel }));
  },

  openPanel() {
    set({ showPanel: true });
  },

  closePanel() {
    set({ showPanel: false });
  },
}));
