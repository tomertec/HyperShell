import { createStore } from "zustand/vanilla";

export interface BroadcastState {
  enabled: boolean;
  targetSessionIds: string[];
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  setTargets: (sessionIds: string[]) => void;
  removeTarget: (sessionId: string) => void;
  cleanTargets: (activeSessionIds: string[]) => void;
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
      }),
    removeTarget: (sessionId) =>
      set((state) => {
        const filtered = state.targetSessionIds.filter((id) => id !== sessionId);
        if (filtered.length === state.targetSessionIds.length) {
          return state;
        }
        return { targetSessionIds: filtered };
      }),
    cleanTargets: (activeSessionIds) =>
      set((state) => {
        const activeSet = new Set(activeSessionIds);
        const filtered = state.targetSessionIds.filter((id) => activeSet.has(id));
        if (filtered.length === state.targetSessionIds.length) {
          return state;
        }
        return { targetSessionIds: filtered };
      })
  }));
}

export const broadcastStore = createBroadcastStore();
