import { createStore } from "zustand/vanilla";
import { toast } from "sonner";
import type {
  LocalProfileRecord,
  UpsertLocalProfileRequest
} from "@hypershell/shared";

export type LocalProfilesState = {
  profiles: LocalProfileRecord[];
  loading: boolean;
  load: () => Promise<void>;
  save: (input: UpsertLocalProfileRequest) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setHidden: (id: string, hidden: boolean) => Promise<void>;
  reorder: (items: Array<{ id: string; sortOrder: number }>) => Promise<void>;
  rescan: () => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Profiles the user can actually launch — hidden and missing shells are excluded. */
export function selectLaunchableProfiles(
  profiles: LocalProfileRecord[]
): LocalProfileRecord[] {
  return profiles.filter((profile) => !profile.isHidden && profile.isAvailable);
}

export const localProfilesStore = createStore<LocalProfilesState>()((set, get) => ({
  profiles: [],
  loading: false,

  load: async () => {
    const list = window.hypershell?.listLocalProfiles;
    if (!list) {
      return;
    }

    set({ loading: true });
    try {
      set({ profiles: await list(), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  save: async (input) => {
    await window.hypershell?.upsertLocalProfile?.(input);
    await get().load();
  },

  remove: async (id) => {
    await window.hypershell?.removeLocalProfile?.({ id });
    await get().load();
  },

  // These three are fired as `void store.setHidden(...)` from the sidebar, so
  // a rejection here would be an unhandled promise rejection the user never
  // sees. Report it and reload, which also rolls the optimistic-looking UI
  // back to whatever the main process actually has.
  setHidden: async (id, hidden) => {
    try {
      await window.hypershell?.setLocalProfileHidden?.({ id, hidden });
    } catch (error) {
      toast.error(`Failed to ${hidden ? "hide" : "unhide"} profile: ${errorMessage(error)}`);
    }
    await get().load();
  },

  reorder: async (items) => {
    try {
      await window.hypershell?.reorderLocalProfiles?.({ items });
    } catch (error) {
      toast.error(`Failed to reorder profiles: ${errorMessage(error)}`);
    }
    await get().load();
  },

  rescan: async () => {
    try {
      const profiles = await window.hypershell?.rescanLocalProfiles?.();
      if (profiles) {
        set({ profiles });
      }
    } catch (error) {
      toast.error(`Failed to rescan local shells: ${errorMessage(error)}`);
    }
  }
}));
