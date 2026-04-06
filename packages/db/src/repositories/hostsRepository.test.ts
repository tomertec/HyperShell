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
});
