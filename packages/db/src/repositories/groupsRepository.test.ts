import { describe, expect, it } from "vitest";
import { createGroupsRepository } from "./groupsRepository";

describe("groupsRepository", () => {
  it("creates and lists groups", () => {
    const repo = createGroupsRepository();
    repo.create({ id: "g1", name: "Production", description: "Prod servers" });
    repo.create({ id: "g2", name: "Development", description: null });
    const groups = repo.list();
    expect(groups).toHaveLength(2);
    expect(groups[0]?.name).toBe("Development");
    expect(groups[1]?.name).toBe("Production");
  });

  it("removes a group", () => {
    const repo = createGroupsRepository();
    repo.create({ id: "g1", name: "Test" });
    expect(repo.remove("g1")).toBe(true);
    expect(repo.list()).toHaveLength(0);
  });

  it("upserts existing group", () => {
    const repo = createGroupsRepository();
    repo.create({ id: "g1", name: "Old Name" });
    repo.create({ id: "g1", name: "New Name" });
    expect(repo.list()).toHaveLength(1);
    expect(repo.get("g1")?.name).toBe("New Name");
  });
});
