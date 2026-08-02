import { describe, expect, it } from "vitest";
import { reconcileLocalProfiles } from "./reconcileLocalProfiles";
import type { LocalProfileStore, StoredProfile } from "./reconcileLocalProfiles";
import type { DetectedShell } from "@hypershell/session-core";

function createFakeStore(initial: StoredProfile[] = []): LocalProfileStore & {
  rows: StoredProfile[];
} {
  const rows = [...initial];

  return {
    rows,
    list: () => rows.map((row) => ({ ...row })),
    create: (input) => {
      const row: StoredProfile = {
        id: input.id,
        name: input.name,
        executable: input.executable,
        detectKey: input.detectKey ?? null,
        source: "detected",
        isAvailable: true,
        isHidden: false,
        sortOrder: input.sortOrder ?? 0
      };
      rows.push(row);
      return row;
    },
    setAvailable: (id, available) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) {
        row.isAvailable = available;
      }
    }
  };
}

const pwsh: DetectedShell = {
  detectKey: "pwsh7",
  name: "PowerShell",
  executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
  args: [],
  icon: "powershell"
};

const cmd: DetectedShell = {
  detectKey: "cmd",
  name: "Command Prompt",
  executable: "C:\\Windows\\System32\\cmd.exe",
  args: [],
  icon: "cmd"
};

let counter = 0;
const createId = () => `generated-${(counter += 1)}`;

describe("reconcileLocalProfiles", () => {
  it("inserts a profile for each newly detected shell", () => {
    const store = createFakeStore();

    const summary = reconcileLocalProfiles(store, [pwsh, cmd], createId);

    expect(summary.inserted).toHaveLength(2);
    expect(store.rows.map((row) => row.detectKey).sort()).toEqual(["cmd", "pwsh7"]);
  });

  it("is idempotent — a second pass inserts nothing", () => {
    const store = createFakeStore();
    reconcileLocalProfiles(store, [pwsh], createId);

    const summary = reconcileLocalProfiles(store, [pwsh], createId);

    expect(summary.inserted).toEqual([]);
    expect(store.rows).toHaveLength(1);
  });

  it("never overwrites user edits to a detected profile", () => {
    const store = createFakeStore([
      {
        id: "existing",
        name: "My Renamed Shell",
        executable: "C:\\custom\\pwsh.exe",
        detectKey: "pwsh7",
        source: "detected",
        isAvailable: true,
        isHidden: false,
        sortOrder: 5
      }
    ]);

    reconcileLocalProfiles(store, [pwsh], createId);

    expect(store.rows[0]).toMatchObject({
      name: "My Renamed Shell",
      executable: "C:\\custom\\pwsh.exe",
      sortOrder: 5
    });
  });

  it("does not resurrect a hidden detected profile", () => {
    const store = createFakeStore([
      {
        id: "tombstoned",
        name: "Command Prompt",
        executable: "C:\\Windows\\System32\\cmd.exe",
        detectKey: "cmd",
        source: "detected",
        isAvailable: true,
        isHidden: true,
        sortOrder: 0
      }
    ]);

    const summary = reconcileLocalProfiles(store, [cmd], createId);

    expect(summary.inserted).toEqual([]);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].isHidden).toBe(true);
  });

  it("marks a vanished shell unavailable instead of deleting it", () => {
    const store = createFakeStore();
    reconcileLocalProfiles(store, [pwsh, cmd], createId);

    const summary = reconcileLocalProfiles(store, [pwsh], createId);

    const cmdRow = store.rows.find((row) => row.detectKey === "cmd");
    expect(cmdRow?.isAvailable).toBe(false);
    expect(summary.markedUnavailable).toEqual([cmdRow?.id]);
    expect(store.rows).toHaveLength(2);
  });

  it("restores availability when a shell reappears", () => {
    const store = createFakeStore();
    reconcileLocalProfiles(store, [pwsh, cmd], createId);
    reconcileLocalProfiles(store, [pwsh], createId);

    const summary = reconcileLocalProfiles(store, [pwsh, cmd], createId);

    const cmdRow = store.rows.find((row) => row.detectKey === "cmd");
    expect(cmdRow?.isAvailable).toBe(true);
    expect(summary.markedAvailable).toEqual([cmdRow?.id]);
  });

  it("leaves user-created profiles completely alone", () => {
    const store = createFakeStore([
      {
        id: "mine",
        name: "Custom",
        executable: "C:\\tools\\my.exe",
        detectKey: null,
        source: "user",
        isAvailable: true,
        isHidden: false,
        sortOrder: 0
      }
    ]);

    const summary = reconcileLocalProfiles(store, [pwsh], createId);

    expect(summary.markedUnavailable).toEqual([]);
    expect(store.rows.find((row) => row.id === "mine")?.isAvailable).toBe(true);
  });

  it("deduplicates duplicate detectKeys within a single pass", () => {
    const store = createFakeStore();
    const duplicatePwsh: DetectedShell = {
      detectKey: "pwsh7",
      name: "PowerShell (duplicate)",
      executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      args: [],
      icon: "powershell"
    };

    const summary = reconcileLocalProfiles(
      store,
      [pwsh, duplicatePwsh],
      createId
    );

    const pwshRows = store.rows.filter((row) => row.detectKey === "pwsh7");
    expect(pwshRows).toHaveLength(1);
    expect(summary.inserted).toHaveLength(1);
  });
});

describe("reconcileLocalProfiles name collisions", () => {
  /**
   * `local_profiles.name` is UNIQUE but the repository upsert only conflicts on
   * `id`, so a user-created profile that happens to be called "PowerShell"
   * makes the detected pwsh row's INSERT throw. This fake reproduces that
   * exactly: same constraint, same error text.
   */
  function createUniqueNameStore(initial: StoredProfile[]): LocalProfileStore & {
    rows: StoredProfile[];
  } {
    const rows = [...initial];

    return {
      rows,
      list: () => rows.map((row) => ({ ...row })),
      create: (input) => {
        if (rows.some((row) => row.name === input.name)) {
          throw new Error("UNIQUE constraint failed: local_profiles.name");
        }
        const row: StoredProfile = {
          id: input.id,
          name: input.name,
          executable: input.executable,
          detectKey: input.detectKey ?? null,
          source: "detected",
          isAvailable: true,
          isHidden: false,
          sortOrder: input.sortOrder ?? 0
        };
        rows.push(row);
        return row;
      },
      setAvailable: (id, available) => {
        const row = rows.find((candidate) => candidate.id === id);
        if (row) {
          row.isAvailable = available;
        }
      }
    };
  }

  const userPowerShell: StoredProfile = {
    id: "user-1",
    name: "PowerShell",
    executable: "C:\\my\\pwsh.exe",
    // A user profile has no detect key, so it is invisible to the detect-key
    // map — reconciliation cannot see the collision coming.
    detectKey: null,
    source: "user",
    isAvailable: true,
    isHidden: false,
    sortOrder: 1
  };

  it("does not throw when a user profile already owns a detected shell's name", () => {
    const store = createUniqueNameStore([userPowerShell]);

    expect(() => reconcileLocalProfiles(store, [pwsh, cmd], createId)).not.toThrow();
  });

  it("still inserts every other shell and reports the one it skipped", () => {
    const store = createUniqueNameStore([userPowerShell]);

    const summary = reconcileLocalProfiles(store, [pwsh, cmd], createId);

    expect(store.rows.some((row) => row.detectKey === "cmd")).toBe(true);
    expect(summary.inserted).toHaveLength(1);
    expect(summary.skipped.map((entry) => entry.detectKey)).toEqual(["pwsh7"]);
    expect(summary.skipped[0].reason).toContain("local_profiles.name");
  });

  it("leaves the user's own profile untouched", () => {
    const store = createUniqueNameStore([userPowerShell]);

    reconcileLocalProfiles(store, [pwsh, cmd], createId);

    const preserved = store.rows.find((row) => row.id === "user-1");
    expect(preserved).toEqual(userPowerShell);
  });
});
