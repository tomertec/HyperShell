import { describe, expect, it } from "vitest";
import { openDatabase } from "../index";
import { createLocalProfilesRepositoryFromDatabase } from "./localProfilesRepository";

function createRepo() {
  return createLocalProfilesRepositoryFromDatabase(openDatabase(":memory:"));
}

const baseInput = {
  id: "profile-1",
  name: "PowerShell",
  executable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
};

describe("localProfilesRepository", () => {
  it("round-trips a profile with defaults applied", () => {
    const repo = createRepo();
    const created = repo.create(baseInput);

    expect(created).toMatchObject({
      id: "profile-1",
      name: "PowerShell",
      args: [],
      startingDirectory: null,
      icon: "terminal",
      color: null,
      elevated: false,
      source: "user",
      detectKey: null,
      isAvailable: true,
      isHidden: false
    });
  });

  it("round-trips args as a JSON array", () => {
    const repo = createRepo();
    repo.create({ ...baseInput, args: ["-d", "Ubuntu-22.04"] });

    expect(repo.get("profile-1")?.args).toEqual(["-d", "Ubuntu-22.04"]);
  });

  it("looks a profile up by detect key", () => {
    const repo = createRepo();
    repo.create({ ...baseInput, source: "detected", detectKey: "pwsh7" });

    expect(repo.getByDetectKey("pwsh7")?.id).toBe("profile-1");
    expect(repo.getByDetectKey("cmd")).toBeUndefined();
  });

  it("updates availability and hidden flags independently", () => {
    const repo = createRepo();
    repo.create({ ...baseInput, source: "detected", detectKey: "pwsh7" });

    repo.setAvailable("profile-1", false);
    repo.setHidden("profile-1", true);

    const profile = repo.get("profile-1");
    expect(profile?.isAvailable).toBe(false);
    expect(profile?.isHidden).toBe(true);
  });

  it("lists profiles ordered by sort order then name", () => {
    const repo = createRepo();
    repo.create({ id: "b", name: "Bravo", executable: "b.exe", sortOrder: 2 });
    repo.create({ id: "a", name: "Alpha", executable: "a.exe", sortOrder: 1 });

    expect(repo.list().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("persists a new sort order", () => {
    const repo = createRepo();
    repo.create({ id: "a", name: "Alpha", executable: "a.exe", sortOrder: 1 });
    repo.create({ id: "b", name: "Bravo", executable: "b.exe", sortOrder: 2 });

    repo.reorder([
      { id: "b", sortOrder: 1 },
      { id: "a", sortOrder: 2 }
    ]);

    expect(repo.list().map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("replaces env vars wholesale and cascades on delete", () => {
    const repo = createRepo();
    repo.create(baseInput);

    repo.replaceEnvVars("profile-1", [{ name: "FOO", value: "1", isEnabled: true }]);
    expect(repo.listEnvVars("profile-1")).toEqual([
      expect.objectContaining({ name: "FOO", value: "1", isEnabled: true })
    ]);

    repo.replaceEnvVars("profile-1", [{ name: "BAR", value: "2", isEnabled: false }]);
    expect(repo.listEnvVars("profile-1").map((v) => v.name)).toEqual(["BAR"]);

    repo.remove("profile-1");
    expect(repo.listEnvVars("profile-1")).toEqual([]);
  });
});
