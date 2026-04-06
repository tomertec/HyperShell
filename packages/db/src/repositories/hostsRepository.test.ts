import { describe, expect, it } from "vitest";

import { createHostsRepository } from "./hostsRepository";

describe("hostsRepository", () => {
  it("creates and lists hosts", () => {
    const repo = createHostsRepository(":memory:");

    repo.create({
      id: "host-1",
      name: "web-01",
      hostname: "web-01.example.com",
      port: 22
    });

    expect(repo.list()).toHaveLength(1);
  });

  it("removes a host by id", () => {
    const repo = createHostsRepository();
    repo.create({ id: "h1", name: "test", hostname: "example.com" });
    expect(repo.remove("h1")).toBe(true);
    expect(repo.list()).toHaveLength(0);
  });

  it("returns false when removing a non-existent host", () => {
    const repo = createHostsRepository();
    expect(repo.remove("nonexistent")).toBe(false);
  });
});
