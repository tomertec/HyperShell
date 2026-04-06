import { createStore } from "zustand/vanilla";

export interface SessionRecoveryState {
  recoverableSessionIds: string[];
  remember: (sessionId: string) => void;
  forget: (sessionId: string) => void;
  clear: () => void;
}

export function createSessionRecoveryStore() {
  return createStore<SessionRecoveryState>()((set) => ({
    recoverableSessionIds: [],
    remember: (sessionId) =>
      set((state) => ({
        recoverableSessionIds: state.recoverableSessionIds.includes(sessionId)
          ? state.recoverableSessionIds
          : [...state.recoverableSessionIds, sessionId]
      })),
    forget: (sessionId) =>
      set((state) => ({
        recoverableSessionIds: state.recoverableSessionIds.filter(
          (currentSessionId) => currentSessionId !== sessionId
        )
      })),
    clear: () => set({ recoverableSessionIds: [] })
  }));
}

export const sessionRecoveryStore = createSessionRecoveryStore();
