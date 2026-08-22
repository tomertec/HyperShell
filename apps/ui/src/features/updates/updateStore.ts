import { create } from "zustand";
import type { UpdateState } from "@hypershell/shared";
import { getShell } from "../../lib/shell";

interface UpdateStoreState {
  update: UpdateState | null;
  dismissedVersion: string | null;
  applyState: (state: UpdateState) => void;
  dismiss: () => void;
  refresh: () => Promise<void>;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  openRelease: () => Promise<void>;
}

export function shouldShowBanner(
  update: UpdateState | null,
  dismissedVersion: string | null
): boolean {
  if (!update) {
    return false;
  }
  const actionable =
    update.status === "available" ||
    update.status === "manual-available" ||
    update.status === "downloading" ||
    update.status === "downloaded";
  if (!actionable) {
    return false;
  }
  // While actively downloading/downloaded, keep showing regardless of dismissal.
  if (update.status === "downloading" || update.status === "downloaded") {
    return true;
  }
  return update.availableVersion !== dismissedVersion;
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  update: null,
  dismissedVersion: null,
  applyState(state) {
    set({ update: state });
  },
  dismiss() {
    set({ dismissedVersion: get().update?.availableVersion ?? null });
  },
  async refresh() {
    try {
      const state = await getShell().getUpdateState();
      if (state) {
        set({ update: state });
      }
    } catch {
      /* ignore */
    }
  },
  async check() {
    try {
      await getShell().checkForUpdates();
    } catch {
      /* ignore */
    }
  },
  async download() {
    try {
      await getShell().downloadUpdate();
    } catch {
      /* ignore */
    }
  },
  async install() {
    try {
      await getShell().installUpdate();
    } catch {
      /* ignore */
    }
  },
  async openRelease() {
    try {
      await getShell().openUpdateRelease();
    } catch {
      /* ignore */
    }
  }
}));
