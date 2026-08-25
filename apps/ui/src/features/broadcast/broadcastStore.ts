import { createStore } from "zustand/vanilla";
import { getShell, hasShell } from "../../lib/shell";

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

function pushBroadcastState(state: Pick<BroadcastState, "enabled" | "targetSessionIds">): void {
  if (!hasShell()) {
    return;
  }

  void getShell()
    .setBroadcastTargets({ enabled: state.enabled, targetSessionIds: state.targetSessionIds })
    .catch((error) => {
      console.warn("[hypershell] setBroadcastTargets failed", error);
    });
}

/**
 * Keeps main's broadcast-fan-out target list (read by GhosttyHostClient's
 * getBroadcastTargets) in sync with this store. Pushes the current state
 * immediately on subscribe — main starts with `{enabled: false,
 * targetSessionIds: []}`, so a renderer that boots with different (e.g.
 * restored/live) state must tell main right away rather than waiting for
 * the next toggle — then again on every subsequent enabled/targetSessionIds
 * change. Zustand's vanilla store skips notifying subscribers when an action
 * returns the same state reference (every no-op branch in this file does),
 * so no extra change-detection is needed here.
 */
export function syncBroadcastStoreToMain(
  store: ReturnType<typeof createBroadcastStore>
): () => void {
  pushBroadcastState(store.getState());
  return store.subscribe((state) => pushBroadcastState(state));
}

export const broadcastStore = createBroadcastStore();
syncBroadcastStoreToMain(broadcastStore);
