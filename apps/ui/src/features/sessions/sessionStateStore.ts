import { createStore } from "zustand/vanilla";

interface SessionStateEntry {
  state: string;
  connectedAt: number | null;
}

interface SessionStateStore {
  sessions: Record<string, SessionStateEntry>;
  setSessionState: (sessionId: string, state: string) => void;
  removeSession: (sessionId: string) => void;
}

export const sessionStateStore = createStore<SessionStateStore>()((set) => ({
  sessions: {},
  setSessionState: (sessionId, state) =>
    set((store) => {
      const existing = store.sessions[sessionId];
      const connectedAt =
        state === "connected"
          ? (existing?.connectedAt ?? Date.now())
          : (existing?.connectedAt ?? null);
      if (existing?.state === state && existing?.connectedAt === connectedAt) {
        return store;
      }
      return {
        sessions: {
          ...store.sessions,
          [sessionId]: { state, connectedAt }
        }
      };
    }),
  removeSession: (sessionId) =>
    set((store) => {
      const { [sessionId]: _removed, ...rest } = store.sessions;
      return { sessions: rest };
    })
}));
