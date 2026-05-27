import { create } from "zustand";
import type { UpdateState } from "@hypershell/shared";

interface UpdateStoreState {
  update: UpdateState | null;
  dismissedVersion: string | null;
  setState: (state: UpdateState) => void;
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
  setState(state) {
    set({ update: state });
  },
  dismiss() {
    set({ dismissedVersion: get().update?.availableVersion ?? null });
  },
  async refresh() {
    const state = await window.hypershell?.getUpdateState?.();
    if (state) {
      set({ update: state });
    }
  },
  async check() {
    await window.hypershell?.checkForUpdates?.();
  },
  async download() {
    await window.hypershell?.downloadUpdate?.();
  },
  async install() {
    await window.hypershell?.installUpdate?.();
  },
  async openRelease() {
    await window.hypershell?.openUpdateRelease?.();
  }
}));
