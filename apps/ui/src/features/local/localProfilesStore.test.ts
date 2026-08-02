import { beforeEach, describe, expect, it, vi } from "vitest";
import { localProfilesStore, selectLaunchableProfiles } from "./localProfilesStore";
import type { LocalProfileRecord } from "@hypershell/shared";

function profile(overrides: Partial<LocalProfileRecord> = {}): LocalProfileRecord {
  return {
    id: "p1",
    name: "PowerShell",
    executable: "pwsh.exe",
    args: [],
    startingDirectory: null,
    icon: "powershell",
    color: null,
    elevated: false,
    source: "detected",
    detectKey: "pwsh7",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1,
    ...overrides
  };
}

describe("selectLaunchableProfiles", () => {
  it("keeps available, visible profiles", () => {
    expect(selectLaunchableProfiles([profile()])).toHaveLength(1);
  });

  it("drops hidden profiles", () => {
    expect(selectLaunchableProfiles([profile({ isHidden: true })])).toEqual([]);
  });

  it("drops unavailable profiles", () => {
    expect(selectLaunchableProfiles([profile({ isAvailable: false })])).toEqual([]);
  });
});

describe("localProfilesStore", () => {
  beforeEach(() => {
    localProfilesStore.setState({ profiles: [], loading: false });
  });

  it("loads profiles from the bridge", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile()]);
    vi.stubGlobal("window", { hypershell: { listLocalProfiles } });

    await localProfilesStore.getState().load();

    expect(localProfilesStore.getState().profiles).toHaveLength(1);
    expect(localProfilesStore.getState().loading).toBe(false);
  });

  it("leaves state empty when the bridge is unavailable", async () => {
    vi.stubGlobal("window", { hypershell: {} });

    await localProfilesStore.getState().load();

    expect(localProfilesStore.getState().profiles).toEqual([]);
  });

  it("reloads after a save", async () => {
    const listLocalProfiles = vi.fn().mockResolvedValue([profile({ name: "Renamed" })]);
    const upsertLocalProfile = vi.fn().mockResolvedValue(profile({ name: "Renamed" }));
    vi.stubGlobal("window", { hypershell: { listLocalProfiles, upsertLocalProfile } });

    await localProfilesStore
      .getState()
      .save({ id: "p1", name: "Renamed", executable: "pwsh.exe" });

    expect(upsertLocalProfile).toHaveBeenCalled();
    expect(localProfilesStore.getState().profiles[0].name).toBe("Renamed");
  });
});
