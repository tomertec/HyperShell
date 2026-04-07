import { describe, it, expect, beforeEach } from "vitest";
import { openDatabase } from "../index";
import { createWorkspaceRepository } from "./workspaceRepository";
import type { WorkspaceRepository } from "./workspaceRepository";

describe("workspaceRepository", () => {
  let repo: WorkspaceRepository;

  beforeEach(() => {
    const db = openDatabase(":memory:");
    repo = createWorkspaceRepository(db);
  });

  it("saves and loads a workspace", () => {
    const layout = {
      tabs: [],
      splitDirection: "horizontal" as const,
      paneSizes: [100],
      paneCount: 1,
    };
    repo.save("dev", layout);
    const result = repo.load("dev");
    expect(result).toBeDefined();
    expect(result!.name).toBe("dev");
    expect(result!.layout).toEqual(layout);
    expect(result!.updatedAt).toBeTruthy();
  });

  it("returns undefined for missing workspace", () => {
    expect(repo.load("nonexistent")).toBeUndefined();
  });

  it("lists workspaces", () => {
    repo.save("a", {
      tabs: [],
      splitDirection: "horizontal",
      paneSizes: [100],
      paneCount: 1,
    });
    repo.save("b", {
      tabs: [],
      splitDirection: "vertical",
      paneSizes: [100],
      paneCount: 1,
    });
    const list = repo.list();
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.name).sort()).toEqual(["a", "b"]);
  });

  it("removes a workspace", () => {
    repo.save("a", {
      tabs: [],
      splitDirection: "horizontal",
      paneSizes: [100],
      paneCount: 1,
    });
    expect(repo.remove("a")).toBe(true);
    expect(repo.load("a")).toBeUndefined();
  });

  it("returns false when removing nonexistent workspace", () => {
    expect(repo.remove("nonexistent")).toBe(false);
  });

  it("overwrites existing workspace on save", () => {
    repo.save("dev", {
      tabs: [],
      splitDirection: "horizontal",
      paneSizes: [100],
      paneCount: 1,
    });
    repo.save("dev", {
      tabs: [{ transport: "ssh", profileId: "host-1", title: "Server" }],
      splitDirection: "vertical",
      paneSizes: [50, 50],
      paneCount: 2,
    });
    const result = repo.load("dev");
    expect(result!.layout.tabs).toHaveLength(1);
    expect(result!.layout.splitDirection).toBe("vertical");
    expect(repo.list()).toHaveLength(1);
  });
});
