import { createStore } from "zustand/vanilla";
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

  setHidden: async (id, hidden) => {
    await window.hypershell?.setLocalProfileHidden?.({ id, hidden });
    await get().load();
  },

  reorder: async (items) => {
    await window.hypershell?.reorderLocalProfiles?.({ items });
    await get().load();
  },

  rescan: async () => {
    const profiles = await window.hypershell?.rescanLocalProfiles?.();
    if (profiles) {
      set({ profiles });
    }
  }
}));
