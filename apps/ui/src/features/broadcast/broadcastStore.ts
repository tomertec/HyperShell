import { createStore } from "zustand/vanilla";

export interface BroadcastState {
  enabled: boolean;
  targetSessionIds: string[];
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  setTargets: (sessionIds: string[]) => void;
}

export function createBroadcastStore() {
  return createStore<BroadcastState>()((set) => ({
    enabled: false,
    targetSessionIds: [],
    enable: () => set({ enabled: true }),
    disable: () => set({ enabled: false }),
    toggle: () =>
      set((state) => ({
        enabled: !state.enabled
      })),
    setTargets: (sessionIds) =>
      set((state) => {
        const deduped = Array.from(new Set(sessionIds));
        if (
          deduped.length === state.targetSessionIds.length &&
          deduped.every((id, i) => id === state.targetSessionIds[i])
        ) {
          return state;
        }
        return { targetSessionIds: deduped };
      })
  }));
}

export const broadcastStore = createBroadcastStore();
